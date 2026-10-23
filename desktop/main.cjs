'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { canonicalDirectory, saveArtifact } = require('./output-files.cjs');

const role = require('../package.json').stelexRole;
const isAdminLaunch = global[Symbol.for('stelex.admin.unlocked')] === true || role === 'admin' || (!role && (/stelex admin/i.test(path.basename(process.execPath)) || process.argv.includes('--admin')));
app.setName(isAdminLaunch ? 'Stelex Admin' : 'Stelex GPT');
app.setAppUserModelId(isAdminLaunch ? 'com.stelex.admin' : 'com.stelex.gpt');
app.setPath('userData', path.join(app.getPath('appData'), isAdminLaunch ? 'Stelex Admin' : 'Stelex GPT'));
const appRoot = path.resolve(__dirname, '..');
const dataRoot = app.getPath('userData');
const windows = new Set();
const adminWindows = new WeakMap();
let backend;let sharedService;let webLink;
let activeUrl;
let localUrl;
let settings = {};
let preferences = {};
let outputDirectory = null;
let outputWrite = Promise.resolve();
const generationStatus=new Map();
const microphoneLeases=new Map(),voiceJobs=new Map();
let preferenceWrite = Promise.resolve();
let quitting = false;
const smokeFile = process.env.CI === 'true' && process.env.STELEX_SMOKE_TEST_FILE && path.isAbsolute(process.env.STELEX_SMOKE_TEST_FILE)
  ? process.env.STELEX_SMOKE_TEST_FILE : null;
if(smokeFile && process.env.STELEX_VOICE_PERMISSION_SMOKE==='true'){app.commandLine.appendSwitch('use-fake-device-for-media-stream');}
let smokeFinished = false;
async function finishSmoke(result) {
  if (!smokeFile || smokeFinished) return;
  smokeFinished = true;
  try {
    await fs.mkdir(path.dirname(smokeFile), { recursive: true });
    await fs.writeFile(smokeFile, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  } finally { quitting = true; webLink?.stop(); backend?.kill();sharedService?.release(); if (result.ok) app.quit(); else app.exit(1); }
}
async function inspectSmoke(window, admin) {
  if (!smokeFile || smokeFinished) return;
  const deadline = Date.now() + 15_000;
  let lastSmokeError;
  do {
    try {
      const state = await window.webContents.executeJavaScript(`(async () => {
        const view = document.querySelector(${JSON.stringify(admin ? '#login-panel' : '.auth-screen')});
        const response = await fetch('/api/health');
        const health = await response.json();
        return { ok: Boolean(view && response.ok && health.ok), view: ${JSON.stringify(admin ? 'admin' : 'app')}, title: document.title, demoMode: health.demoMode };
      })()`);
      if(state.ok && !admin && process.env.STELEX_VOICE_PERMISSION_SMOKE==='true'){
        const permissions=await window.webContents.executeJavaScript(`(async()=>{
          await window.stelexDesktop.beginVoiceCapture();
          let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});const audioPermissionAccepted=stream.getTracks().every(track=>track.kind==='audio');stream.getTracks().forEach(track=>track.stop());let cameraAccessDenied=false;try{const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:true});camera.getTracks().forEach(track=>track.stop());}catch{cameraAccessDenied=true;}return{audioPermissionAccepted,cameraAccessDenied};}finally{stream?.getTracks().forEach(track=>track.stop());await window.stelexDesktop.endVoiceCapture();}
        })()`);
        Object.assign(state,permissions);state.ok=state.ok&&permissions.audioPermissionAccepted&&permissions.cameraAccessDenied;
      }
      if (state.ok) { await finishSmoke(state); return; }
    } catch(error) { lastSmokeError=error.message; }
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  } while (Date.now() < deadline && !smokeFinished);
  await finishSmoke({ ok: false, view: admin ? 'admin' : 'app', error: lastSmokeError || 'The application did not render a healthy sign-in screen within 15 seconds.' });
}

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
  return window;
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
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('appData'),'Stelex GPT','connection.json'), 'utf8'));
    return saved.serverUrl ? { serverUrl: parseServerUrl(saved.serverUrl) } : {};
  } catch { return {}; }
}

async function readPreferences() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(dataRoot, 'preferences.json'), 'utf8'));
    return ['de', 'en'].includes(saved.language) ? { language: saved.language } : {};
  } catch { return {}; }
}

async function readOutputDirectory() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(dataRoot, 'output-directory.json'), 'utf8'));
    const directory = await canonicalDirectory(saved.path);
    return directory === saved.path ? directory : null;
  } catch { return null; }
}

async function chooseOutputDirectory(window) {
  const result = await dialog.showOpenDialog(window, {
    title: preferences.language === 'en' ? 'Choose a folder for generated files' : 'Ordner für erstellte Dateien wählen',
    defaultPath: outputDirectory || app.getPath('desktop'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const chosen = await canonicalDirectory(result.filePaths[0]);
  await fs.writeFile(path.join(dataRoot, 'output-directory.json'), `${JSON.stringify({ path: chosen })}\n`, { mode: 0o600 });
  outputDirectory = chosen;
  return { path: chosen };
}

async function startInstalledOllama() {
  if (process.platform !== 'win32') return false;
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'),
  ].filter(Boolean);
  let executable = 'ollama';
  for (const candidate of candidates) {
    try { if ((await fs.stat(candidate)).isFile()) { executable = candidate; break; } } catch { /* Try PATH after installed locations. */ }
  }
  return await new Promise(resolveStart => {
    try {
      const child = spawn(executable, ['serve'], { env:{...process.env,OLLAMA_MAX_LOADED_MODELS:'1',OLLAMA_NUM_PARALLEL:'1'}, windowsHide: true, detached: true, stdio: 'ignore' });
      child.once('error', () => resolveStart(false));
      child.once('spawn', () => { child.unref(); resolveStart(true); });
    } catch { resolveStart(false); }
  });
}

async function detectOllama(){
  const baseUrl=process.env.STELEX_AI_BASE_URL||'http://127.0.0.1:11434/v1';
  if(process.env.STELEX_AI_BASE_URL || process.env.STELEX_AI_MODELS)return{baseUrl,model:process.env.STELEX_AI_MODELS||'qwen3.5-abliterated:9b',available:true};
  const {localModels,catalog}=require('./model-catalog.cjs');
  if(smokeFile && process.env.STELEX_DEMO_MODE==='true')return{baseUrl,model:JSON.stringify(localModels()),available:false};
  const inspect=async()=>{
    const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error('Ollama unavailable');
    const data=await response.json();const names=(data.models||[]).map(entry=>entry.name||entry.model);const details={};
    for(const item of catalog){if(!names.includes(item.id))continue;try{const show=await fetch('http://127.0.0.1:11434/api/show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:item.id}),signal:AbortSignal.timeout(2500)});if(show.ok)details[item.id]=await show.json();}catch{}}
    return{baseUrl,model:JSON.stringify(localModels(names,details)),available:names.length>0};
  };
  try{return await inspect();}catch{
    if(await startInstalledOllama()){for(let n=0;n<30;n++){await new Promise(resolve=>setTimeout(resolve,250));try{return await inspect();}catch{}}}
    return{baseUrl,model:JSON.stringify(localModels()),available:false};
  }
}

async function startLocalBackend() {
  if (localUrl) return localUrl;
  await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const ollama=await detectOllama();
  const runtime=app.isPackaged ? path.join(process.resourcesPath,'runtime',process.platform==='win32'?'node.exe':'node') : process.env.STELEX_NODE_PATH || 'node';
  const root=path.join(app.getPath('appData'),'Stelex GPT');
  sharedService=await require('./shared-backend.cjs').connectShared({root,runtime,appRoot,admin:isAdminLaunch,env:{...process.env,STELEX_LEGACY_ADMIN_DB:path.join(app.getPath('appData'),'Stelex Admin','server','stelex.sqlite'),STELEX_HOST:'127.0.0.1',STELEX_PORT:'0',STELEX_AI_BASE_URL:ollama.baseUrl,STELEX_AI_MODELS:ollama.model,STELEX_AI_TRANSPORT:process.env.STELEX_AI_BASE_URL?'openai-compatible':'ollama-native',STELEX_PROVIDER_CONCURRENCY:'1',STELEX_DEMO_MODE:smokeFile && process.env.STELEX_DEMO_MODE==='true'?'true':'false'}});
  localUrl=parseServerUrl(sharedService.url);return localUrl;
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
  const contentId=window.webContents.id;
  window.on('closed', () => {windows.delete(window);microphoneLeases.delete(contentId);for(const [id,job] of voiceJobs)if(job.owner===contentId){job.controller.abort();voiceJobs.delete(id);}});
  window.once('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => {
    void inspectSmoke(window, admin);
    const key = Symbol.for('stelex.admin.launchCode');
    if (admin && activeUrl === localUrl && typeof global[key] === 'string') {
      const code=global[key];delete global[key];
      void window.webContents.executeJavaScript(`(() => { const input=document.querySelector('#admin-token'); const form=document.querySelector('#login-form'); if(input && form){input.value=${JSON.stringify(code)};form.requestSubmit();} })()`).catch(()=>{});
    }
  });
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
    // Clipboard writes and explicitly initiated local audio capture are allowed.
    // Camera capture and unrelated permissions remain unavailable.
    const target=BrowserWindow.fromWebContents(contents);
    const audio=require('./media-permissions.cjs').allowAudio({trusted,local:activeUrl===localUrl,admin:adminWindows.get(target),leaseUntil:microphoneLeases.get(contents.id),mainFrame:details.isMainFrame===true,mediaTypes:details.mediaTypes});
    callback(trusted && permission==='clipboard-sanitized-write' || permission==='media'&&audio);
  });
  window.webContents.session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    try {
      const target=BrowserWindow.fromWebContents(contents);
      const trusted=windows.has(target)&&new URL(requestingOrigin).origin===new URL(activeUrl).origin;
      return trusted&&permission==='clipboard-sanitized-write' || permission==='media'&&require('./media-permissions.cjs').allowAudio({trusted,local:activeUrl===localUrl,admin:adminWindows.get(target),leaseUntil:microphoneLeases.get(contents.id),mainFrame:details?.isMainFrame===true,mediaTypes:[details?.mediaType]});
    } catch { return false; }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      if (smokeFile) { void finishSmoke({ ok: false, view: admin ? 'admin' : 'app', error: `Page load failed: ${errorCode}` }); return; }
      void dialog.showMessageBox(window, { type: 'error', title: 'Stelex GPT', message: 'Server nicht erreichbar / Server unavailable', detail: 'Prüfe die Verbindung und starte die App erneut. / Check the connection and restart the app.', buttons: ['OK'] });
    }
  });
  void window.loadURL(`${activeUrl}${admin ? '/admin/' : '/'}`);
  return window;
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Stelex GPT', submenu: [
      { label: 'Neues Fenster / New window', click: () => createWindow(isAdminLaunch) },
      { type: 'separator' },
      { label: 'Lokaler Modus / Local mode', click: async () => {
        try {
          settings = {};
          await fs.writeFile(path.join(app.getPath('appData'),'Stelex GPT','connection.json'), `${JSON.stringify(settings)}\n`, { mode: 0o600 });
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
    if (activeUrl) createWindow(isAdminLaunch);
  });
  app.whenReady().then(async () => {
    await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
    settings = await readSettings();
    preferences = await readPreferences();
    outputDirectory = await readOutputDirectory();
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
      await fs.writeFile(path.join(app.getPath('appData'),'Stelex GPT','connection.json'), `${JSON.stringify(settings)}\n`, { mode: 0o600 });
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
    ipcMain.handle('stelex:output-directory', (event) => {
      validSender(event);
      return { path: outputDirectory };
    });
    ipcMain.handle('stelex:choose-output-directory', (event) => {
      const window = validSender(event);
      outputWrite = outputWrite.catch(() => {}).then(() => {
        validSender(event);
        return chooseOutputDirectory(window);
      });
      return outputWrite;
    });
    ipcMain.handle('stelex:save-artifact', (event, value) => {
      const window = validSender(event);
      outputWrite = outputWrite.catch(() => {}).then(async () => {
        validSender(event);
        if (!outputDirectory) {
          const selected = await chooseOutputDirectory(window);
          if (selected.canceled) return selected;
        }
        return saveArtifact(outputDirectory, value, async (name) => {
          const english = preferences.language === 'en';
          const confirmation = await dialog.showMessageBox(window, {
            type: 'warning',
            title: english ? 'Replace file?' : 'Datei ersetzen?',
            message: name,
            detail: english ? 'This file already exists in the selected output folder.' : 'Diese Datei existiert bereits im ausgewählten Ausgabeordner.',
            buttons: english ? ['Cancel', 'Replace'] : ['Abbrechen', 'Ersetzen'],
            defaultId: 0, cancelId: 0, noLink: true,
          });
          return confirmation.response === 1;
        });
      });
      return outputWrite;
    });
    ipcMain.handle('stelex:begin-voice',(event)=>{const window=validSender(event);if(activeUrl!==localUrl||adminWindows.get(window))throw Error('Spracheingabe ist nur im lokalen Chat verfügbar.');microphoneLeases.set(event.sender.id,Date.now()+90000);return{ok:true};});
    ipcMain.handle('stelex:end-voice',(event)=>{validSender(event);microphoneLeases.delete(event.sender.id);return{ok:true};});
    ipcMain.handle('stelex:cancel-voice',(event,requestId)=>{validSender(event);const job=voiceJobs.get(requestId);if(job?.owner===event.sender.id)job.controller.abort();return{ok:true};});
    ipcMain.handle('stelex:transcribe',(event,value)=>{
      const window=validSender(event);if(activeUrl!==localUrl||adminWindows.get(window))throw Error('Lokale Spracheingabe ist hier nicht verfügbar.');
      if(!value||!/^[a-f0-9-]{36}$/i.test(value.requestId||'')||typeof value.audio!=='string'||value.audio.length>2600000||!['de','en'].includes(value.language))throw Error('Ungültige Sprachanfrage.');
      if(voiceJobs.size)throw Error('Eine Spracherkennung läuft bereits.');
      const controller=new AbortController();voiceJobs.set(value.requestId,{controller,owner:event.sender.id});microphoneLeases.delete(event.sender.id);
      const resourcesPath=app.isPackaged?process.resourcesPath:path.join(appRoot,'artifacts','voice-resources');
      return require('./voice.cjs').transcribe({...value,resourcesPath,runtimeDirectory:app.isPackaged?undefined:path.join(appRoot,'artifacts','voice-runtime'),signal:controller.signal}).finally(()=>voiceJobs.delete(value.requestId));
    });
    ipcMain.handle('stelex:generation-status',(event,requestId)=>{validSender(event);return generationStatus.get(requestId)||{stage:'preparing'};});
    ipcMain.handle('stelex:generate-files',(event,value)=>{
      const window=validSender(event);
      if(!value||typeof value.content!=='string'||value.content.length>1000000||typeof value.requestText!=='string'||value.requestText.length>20000||!/^[a-f0-9-]{36}$/i.test(value.requestId||''))throw new Error('Invalid generation request.');
      outputWrite=outputWrite.catch(()=>{}).then(async()=>{
        validSender(event);
        const {parseGeneratedFiles}=require('./generated-files.cjs');const parsed=parseGeneratedFiles(value.content,value.requestText);
        if(!parsed.files.length)return{files:[],error:parsed.wantsExe?'Die KI hat keinen Python-Code für den EXE-Build geliefert. Bitte um vollständigen Python-Code bitten.':null};
        if(!outputDirectory){const selected=await chooseOutputDirectory(window);if(selected.canceled)return{canceled:true,files:[]};}
        const result=await require('./generation-jobs.cjs').generateFiles({directory:outputDirectory,dataRoot,python:path.join(app.getPath('appData'),'Stelex GPT','tools','python-builder','Scripts','python.exe'),...value,onProgress:state=>{generationStatus.set(value.requestId,state);if(generationStatus.size>100)generationStatus.delete(generationStatus.keys().next().value);}});
        generationStatus.set(value.requestId,{stage:'done'});return result;
      });return outputWrite;
    });
    ipcMain.handle('stelex:external', (event, value) => { validSender(event); return openExternal(value); });
    if(!isAdminLaunch && localUrl){
      webLink=require('./web-link.cjs').createWebLink({directory:dataRoot,safeStorage,expectedOrigin:require('../config/web.json').siteUrl,localOrigin:localUrl,handle:async(kind,p)=>{
        if(kind==='folder')return{path:outputDirectory};
        if(kind==='cancel-voice'){voiceJobs.get('web-voice')?.controller.abort();return{ok:true};}
        if(kind==='generation-status')return generationStatus.get(p.requestId)||{stage:'preparing'};
        if(kind==='voice'){
          if(voiceJobs.size)throw Error('Spracherkennung ist bereits aktiv.');
          if(!p.value||typeof p.value.audio!=='string'||p.value.audio.length>2600000||!['de','en'].includes(p.value.language))throw Error('Ungueltige Audioanfrage.');
          const c=new AbortController(),id='web-voice';voiceJobs.set(id,{controller:c,owner:null});
          try{return await require('./voice.cjs').transcribe({...p.value,resourcesPath:app.isPackaged?process.resourcesPath:appRoot,runtimeDirectory:app.isPackaged?undefined:path.join(appRoot,'artifacts','voice-runtime'),signal:c.signal});}finally{voiceJobs.delete(id);}
        }
        if(kind==='generate'||kind==='save'){
          if(!outputDirectory)throw Error('Zuerst in der Windows-App einen Ausgabeordner auswaehlen.');
          outputWrite=outputWrite.catch(()=>{}).then(async()=>{
            if(kind==='save')return saveArtifact(outputDirectory,p.value);
            const v=p.value;if(!v||typeof v.content!=='string'||v.content.length>1000000||typeof v.requestText!=='string'||v.requestText.length>20000||!/^[a-f0-9-]{36}$/i.test(v.requestId||''))throw Error('Ungueltiger Dateiauftrag.');
            return require('./generation-jobs.cjs').generateFiles({directory:outputDirectory,dataRoot,python:path.join(app.getPath('appData'),'Stelex GPT','tools','python-builder','Scripts','python.exe'),...v,onProgress:x=>generationStatus.set(v.requestId,x)});
          });return outputWrite;
        }
        throw Error('Vorgang nicht unterstuetzt.');
      }});
      await webLink.restore();
    }
    ipcMain.handle('stelex:web-link',(event)=>{validSender(event);return webLink?.state()||{connected:false};});
    ipcMain.handle('stelex:web-disconnect',async(event)=>{validSender(event);return webLink?.disconnect();});
    ipcMain.handle('stelex:web-import',async(event)=>{
      const window=validSender(event);if(!webLink)throw Error('Website-Verbindung nur im lokalen Kundenmodus verfuegbar.');
      const selected=await dialog.showOpenDialog(window,{title:'Stelex-Verbindungsdatei importieren',filters:[{name:'Stelex-Verbindung',extensions:['json']}],properties:['openFile']});if(selected.canceled)return{canceled:true};
      const stat=await fs.stat(selected.filePaths[0]);if(stat.size>5000)throw Error('Datei ungueltig.');
      const value=JSON.parse(await fs.readFile(selected.filePaths[0],'utf8'));require('./web-link.cjs').validateLink(value,require('../config/web.json').siteUrl);
      const answer=await dialog.showMessageBox(window,{type:'question',title:'Website mit deinem PC verbinden?',message:value.siteUrl,detail:'Die Website darf ueber dein Konto KI-Anfragen stellen, GitHub verwenden sowie Dateien im gewaehlten Ausgabeordner speichern und dort angeforderte EXE-Builds ausfuehren. Nur fuer deine eigene Website aktivieren. Du kannst die Verbindung jederzeit beenden.',buttons:['Abbrechen','Verbinden'],defaultId:0,cancelId:0});
      if(answer.response!==1)return{canceled:true};return webLink.connect(value);
    });
    buildMenu();
    createWindow(isAdminLaunch);
    app.on('activate', () => { if (windows.size === 0) createWindow(isAdminLaunch); });
  }).catch((error) => {
    if (smokeFile) { void finishSmoke({ ok: false, view: isAdminLaunch ? 'admin' : 'app', error: error.message }); return; }
    dialog.showErrorBox('Stelex GPT konnte nicht starten / Could not start', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { quitting = true; webLink?.stop(); backend?.kill();sharedService?.release(); });
}
