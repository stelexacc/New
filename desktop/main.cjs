'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { detectOllama: probeOllama } = require('./ollama.cjs');

app.setName('Stelex GPT');
app.setAppUserModelId('com.stelex.gpt');
app.setPath('userData', path.join(app.getPath('appData'), 'Stelex GPT'));

const appRoot = path.resolve(__dirname, '..');
const dataRoot = app.getPath('userData');
const isAdminLaunch = /stelex admin/i.test(path.basename(process.execPath)) || process.argv.includes('--admin');
const windows = new Set();
const adminWindows = new WeakMap();
let backend;
let activeUrl;
let localUrl;
let settings = {};
let preferences = {};
let preferenceWrite = Promise.resolve();
let quitting = false;

function parseServerUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid server URL.');
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Use HTTPS, or HTTP on localhost. Credentials in URLs are not supported.');
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Use the server origin, without a path, query or fragment.');
  return url.origin;
}

function validSender(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !windows.has(window)) throw new Error('Unknown window.');
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || new URL(frame.url).origin !== new URL(activeUrl).origin) {
    throw new Error('Untrusted frame.');
  }
}

async function openExternal(value) {
  if (typeof value !== 'string' || value.length > 4096) return;
  let url;
  try { url = new URL(value); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password) return;
  await shell.openExternal(url.toString());
}

async function readSettings() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(dataRoot, 'connection.json'), 'utf8'));
    return saved.serverUrl ? { serverUrl: parseServerUrl(saved.serverUrl) } : {};
  } catch { return {}; }
}

async function readPreferences() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(dataRoot, 'preferences.json'), 'utf8'));
    return ['de', 'en'].includes(saved.language) ? { language: saved.language } : {};
  } catch { return {}; }
}

async function detectOllama() {
  return probeOllama({ preferredModelPath: path.join(dataRoot, 'ollama-model.json') });
}

async function startLocalBackend() {
  if (localUrl) return localUrl;
  await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const tokenFile = path.join(dataRoot, 'admin-token.txt');
  let adminToken;
  try { adminToken = (await fs.readFile(tokenFile, 'utf8')).trim(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    adminToken = randomBytes(32).toString('hex');
    await fs.writeFile(tokenFile, `${adminToken}\n`, { mode: 0o600, flag: 'wx' });
  }
  const ollama = await detectOllama();
  const runtime = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node')
    : process.env.STELEX_NODE_PATH || 'node';
  const childEnv = {
    ...process.env,
    STELEX_HOST: '127.0.0.1',
    STELEX_PORT: '0',
    STELEX_DATA_DIR: path.join(dataRoot, 'server'),
    STELEX_ADMIN_TOKEN: adminToken,
    STELEX_AI_BASE_URL: ollama.baseUrl,
    STELEX_AI_MODELS: ollama.model,
    STELEX_DEMO_MODE: ollama.available ? 'false' : 'true',
    STELEX_INITIAL_CREDITS: process.env.STELEX_INITIAL_CREDITS || '500',
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  backend = spawn(runtime, [path.join(appRoot, 'server', 'index.mjs')], {
    cwd: appRoot, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stderr.on('data', (chunk) => {
    // Runtime errors stay in the local terminal; credentials are never logged.
    if (!app.isPackaged) process.stderr.write(chunk);
  });
  return await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('The local server did not become ready within 30 seconds.')), 30_000);
    backend.on('error', (error) => { clearTimeout(timeout); reject(error); });
    backend.on('exit', (code) => {
      clearTimeout(timeout);
      if (!localUrl) reject(new Error(`The local server exited (${code}).`));
      else if (!quitting) dialog.showErrorBox('Stelex GPT', 'The local server stopped. Restart Stelex GPT to reconnect.');
    });
    backend.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 64_000) buffer = buffer.slice(-16_000);
      const match = buffer.match(/STELEX_READY=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match && !localUrl) {
        localUrl = parseServerUrl(match[1]);
        clearTimeout(timeout);
        resolve(localUrl);
      }
    });
  });
}

function createWindow(admin = false) {
  const window = new BrowserWindow({
    title: admin ? 'Stelex Admin' : 'Stelex GPT',
    width: admin ? 1150 : 1440, height: 940, minWidth: 760, minHeight: 600,
    backgroundColor: '#09090d', show: false,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, devTools: !app.isPackaged,
    },
  });
  windows.add(window);
  adminWindows.set(window, admin);
  window.on('closed', () => windows.delete(window));
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, target) => {
    let origin;
    try { origin = new URL(target).origin; } catch { event.preventDefault(); return; }
    if (origin !== new URL(activeUrl).origin) { event.preventDefault(); void openExternal(target); }
  });
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    let trusted = false;
    try {
      trusted = windows.has(BrowserWindow.fromWebContents(contents)) &&
        new URL(details.requestingUrl || contents.getURL()).origin === new URL(activeUrl).origin;
    } catch { /* Invalid origins never receive permissions. */ }
    // Copy buttons may write plain text. Reading the clipboard, microphone,
    // camera and every other permission remain unavailable to the renderer.
    callback(trusted && permission === 'clipboard-sanitized-write');
  });
  window.webContents.session.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
    try {
      return permission === 'clipboard-sanitized-write' &&
        windows.has(BrowserWindow.fromWebContents(contents)) &&
        new URL(requestingOrigin).origin === new URL(activeUrl).origin;
    } catch { return false; }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      void dialog.showMessageBox(window, { type: 'error', title: 'Stelex GPT', message: 'Server nicht erreichbar / Server unavailable', detail: 'Prüfe die Verbindung und starte die App erneut. / Check the connection and restart the app.', buttons: ['OK'] });
    }
  });
  void window.loadURL(`${activeUrl}${admin ? '/admin/' : '/'}`);
  return window;
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Stelex GPT', submenu: [
      { label: 'Neues Fenster / New window', click: () => createWindow(false) },
      { type: 'separator' },
      { label: 'Lokaler Modus / Local mode', click: async () => {
        try {
          settings = {};
          await fs.writeFile(path.join(dataRoot, 'connection.json'), `${JSON.stringify(settings)}\n`, { mode: 0o600 });
          activeUrl = await startLocalBackend();
          for (const window of windows) await window.loadURL(`${activeUrl}${adminWindows.get(window) ? '/admin/' : '/'}`);
        } catch (error) { dialog.showErrorBox('Stelex GPT', error.message); }
      } },
      { role: 'quit', label: 'Beenden / Quit' },
    ] },
    { label: 'Bearbeiten / Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Ansicht / View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Hilfe / Help', submenu: [
      { label: 'Discord', click: () => void openExternal('https://discord.gg/stelex') },
      { label: 'Ollama installieren / Install Ollama', click: () => void openExternal('https://ollama.com/download') },
      { label: 'Lokalen Datenordner öffnen / Open local data folder', click: () => void shell.openPath(dataRoot) },
      { label: 'Über Stelex GPT / About Stelex GPT', click: () => void dialog.showMessageBox({ title: 'Stelex GPT', message: `Stelex GPT ${app.getVersion()}`, detail: 'Desktop-Chat mit Ollama und Credits.\nDesktop chat with Ollama and credits.\nhttps://discord.gg/stelex' }) },
    ] },
  ]));
}

const hasLock = app.requestSingleInstanceLock({ admin: isAdminLaunch });
if (!hasLock) app.quit();
else {
  app.on('second-instance', (_event, argv, _directory, data) => {
    if (activeUrl) createWindow(Boolean(data?.admin || argv.includes('--admin') || argv.some((value) => /stelex admin\.exe$/i.test(value))));
  });
  app.whenReady().then(async () => {
    await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
    settings = await readSettings();
    preferences = await readPreferences();
    activeUrl = settings.serverUrl || await startLocalBackend();
    ipcMain.handle('stelex:connection', (event) => {
      validSender(event);
      return { serverUrl: activeUrl, local: activeUrl === localUrl };
    });
    ipcMain.handle('stelex:set-server', async (event, value) => {
      validSender(event);
      const next = value === '' ? await startLocalBackend() : parseServerUrl(value);
      // Verify an intended Stelex server before sending the application there.
      const response = await fetch(`${next}/api/health`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      const health = await response.json();
      if (!response.ok || !health.ok || !Array.isArray(health.models)) throw new Error('The server did not return a valid Stelex health response.');
      settings = next === localUrl ? {} : { serverUrl: next };
      await fs.writeFile(path.join(dataRoot, 'connection.json'), `${JSON.stringify(settings)}\n`, { mode: 0o600 });
      activeUrl = next;
      setTimeout(() => { for (const window of windows) void window.loadURL(`${next}${adminWindows.get(window) ? '/admin/' : '/'}`); }, 100);
    });
    ipcMain.handle('stelex:preferences', (event) => {
      validSender(event);
      return { ...preferences };
    });
    ipcMain.handle('stelex:set-preferences', async (event, value) => {
      validSender(event);
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'language') || !['de', 'en'].includes(value.language)) {
        throw new Error('Preferences must contain only language: de or en.');
      }
      preferences = { language: value.language };
      const contents = `${JSON.stringify(preferences)}\n`;
      preferenceWrite = preferenceWrite.catch(() => {}).then(() => fs.writeFile(path.join(dataRoot, 'preferences.json'), contents, { mode: 0o600 }));
      await preferenceWrite;
    });
    ipcMain.handle('stelex:external', (event, value) => { validSender(event); return openExternal(value); });
    buildMenu();
    createWindow(isAdminLaunch);
    app.on('activate', () => { if (windows.size === 0) createWindow(isAdminLaunch); });
  }).catch((error) => {
    dialog.showErrorBox('Stelex GPT konnte nicht starten / Could not start', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { quitting = true; backend?.kill(); });
}
