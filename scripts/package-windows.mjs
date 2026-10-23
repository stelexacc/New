import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { downloadArtifact } from '@electron/get';
import extract from 'extract-zip';
import { EnvHttpProxyAgent, fetch, setGlobalDispatcher } from 'undici';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(root, 'artifacts');
const packageRoot = path.join(artifactRoot, 'Stelex-GPT-Windows-x64');
const cacheRoot = path.join(os.tmpdir(), 'stelex-downloads');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const electronVersion = packageJson.devDependencies.electron.replace(/^[~^]/, '');
const nodeVersion = '24.19.0';
const dispatcher = new EnvHttpProxyAgent();
setGlobalDispatcher(dispatcher);
const privateInput = (name) => /^(?:\.env(?:\..*)?|\.data|admin-token(?:\.txt)?|.*-private\.pem|.*\.(?:sqlite|db)(?:-wal|-shm)?)$/i.test(name);

async function sha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function treeFingerprint(directory) {
  const hash = createHash('sha256');
  async function visit(relative = '') {
    const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const current = path.join(relative, entry.name);
      if (privateInput(entry.name)) continue;
      if (entry.isDirectory()) await visit(current);
      else if (entry.isFile()) hash.update(`${current.replaceAll(path.sep, '/')}\0${await sha256(path.join(directory, current))}\0`);
      else throw new Error(`Unsupported packaging input: ${current}`);
    }
  }
  await visit();
  return hash.digest('hex');
}

async function download(url, destination) {
  const response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const handle = await fs.open(destination, 'w');
  try {
    for await (const chunk of response.body) await handle.write(chunk);
  } finally { await handle.close(); }
}

async function getNode() {
  const file = path.join(cacheRoot, `node-v${nodeVersion}-win-x64.exe`);
  const response = await fetch(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`, { dispatcher });
  if (!response.ok) throw new Error(`Could not download official Node checksum (${response.status}).`);
  const sums = await response.text();
  const expected = sums.match(/^([a-f\d]{64})\s+win-x64\/node\.exe$/m)?.[1];
  if (!expected) throw new Error('The Node win-x64 checksum is missing from the official checksum manifest.');
  let actual;
  try { actual = await sha256(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (actual !== expected) {
    await download(`https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`, `${file}.partial`);
    if (await sha256(`${file}.partial`) !== expected) {
      await fs.rm(`${file}.partial`, { force: true });
      throw new Error('Node SHA-256 verification failed; the downloaded executable was discarded.');
    }
    await fs.rename(`${file}.partial`, file);
  }
  console.log(`Node ${nodeVersion}: verified SHA-256 ${expected}`);
  return file;
}

async function zipDirectory(source, destination) {
  // PowerShell's compressor does not preserve Unix file permissions, which is
  // acceptable for the Windows target. Linux/macOS use the system zip utility.
  await fs.rm(destination, { force: true });
  await fs.rm(`${destination}.sha256`, { force: true });
  let command;
  let args;
  let powershellScript;
  if (process.platform === 'win32') {
    command = 'powershell.exe';
    powershellScript = path.join(artifactRoot, 'compress-stelex.ps1');
    await fs.writeFile(powershellScript, 'param([string]$Source,[string]$Destination)\n$ErrorActionPreference = "Stop"\nCompress-Archive -LiteralPath $Source -DestinationPath $Destination -CompressionLevel Optimal\n');
    args = ['-NoProfile', '-NonInteractive', '-File', powershellScript, '-Source', source, '-Destination', destination];
  } else {
    command = 'zip';
    args = ['-q', '-r', '-9', destination, path.basename(source)];
  }
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: path.dirname(source), stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ZIP packaging failed (${code}).`)));
    });
  } finally { if (powershellScript) await fs.rm(powershellScript, { force: true }); }
}

try {
  await fs.access(path.join(root, 'dist', 'index.html'));
  await fs.access(path.join(root, 'server', 'index.mjs'));
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.mkdir(artifactRoot, { recursive: true });
  console.log(`Downloading verified Electron ${electronVersion} for Windows x64…`);
  const electronZip = await downloadArtifact({ version: electronVersion, artifactName: 'electron', platform: 'win32', arch: 'x64', cacheRoot });
  const nodeExe = await getNode();
  // This directory contains only generated packaging output, never user data.
  await fs.rm(packageRoot, { recursive: true, force: true });
  await extract(electronZip, { dir: packageRoot });
  await fs.rename(path.join(packageRoot, 'electron.exe'), path.join(packageRoot, 'Stelex GPT.exe'));
  await fs.copyFile(path.join(packageRoot,'Stelex GPT.exe'),path.join(packageRoot,'Stelex Admin.exe'));
  await fs.copyFile(path.join(root,'private-admin.bundle.json'),path.join(packageRoot,'resources','private-admin.bundle.json'));
  await fs.rm(path.join(packageRoot, 'resources', 'default_app.asar'), { force: true });
  const appDir = path.join(packageRoot, 'resources', 'app');
  await fs.mkdir(appDir, { recursive: true });
  for (const directory of ['dist', 'server', 'desktop','config']) {
    await fs.cp(path.join(root, directory), path.join(appDir, directory), { recursive: true, filter: (source) => !privateInput(path.basename(source)) });
  }
  await fs.mkdir(path.join(appDir, 'node_modules'), { recursive: true });
  for (const dependency of ['undici', 'nodemailer']) {
    await fs.cp(path.join(root, 'node_modules', dependency), path.join(appDir, 'node_modules', dependency), { recursive: true });
  }
  await fs.writeFile(path.join(appDir, 'package.json'), `${JSON.stringify({ name: 'stelex-gpt', productName: 'Stelex GPT', version: packageJson.version, private: true, main: 'desktop/entry.cjs', type: 'module', stelexRole:'combined' }, null, 2)}\n`);
  await fs.access(path.join(artifactRoot,'voice-runtime','voice-manifest.json'));
  await fs.cp(path.join(artifactRoot,'voice-runtime'),path.join(packageRoot,'resources','voice'),{recursive:true});
  await fs.mkdir(path.join(packageRoot, 'resources', 'runtime'), { recursive: true });
  await fs.copyFile(nodeExe, path.join(packageRoot, 'resources', 'runtime', 'node.exe'));
  await download(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`, path.join(packageRoot, 'resources', 'runtime', 'NODE-LICENSE.txt'));
  await fs.copyFile(path.join(root,'config','models.json'),path.join(packageRoot,'models.json'));
  const extraFiles = ['scripts/Install.bat', 'scripts/Setup-Ollama.ps1', 'scripts/Setup-Python.ps1','scripts/Setup-Voice.ps1', 'README.md', 'VALIDATION.md'];
  for (const file of extraFiles) {
    try { await fs.copyFile(path.join(root, file), path.join(packageRoot, path.basename(file))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const readme = `STELEX GPT — WINDOWS x64\r\n\r\nDEUTSCH\r\n1. ZIP vollständig entpacken. Nicht nur die EXE kopieren.\r\n2. Install.bat einmal ausfuehren. Es installiert den EXE-Builder, prueft das Sprachmodul und laedt/prueft alle vier Chatmodelle.\r\n3. Modellquelle: huihui_ai/qwen3.5-abliterated:9b; lokaler Alias: qwen3.5-abliterated:9b.\r\n4. Danach Stelex GPT.exe starten. Fehlende Modelle werden mit einem Installationshinweis angezeigt.\r\n5. Ausgabeordner über die Ordner-Schaltfläche wählen; erzeugte Dateien werden automatisch gespeichert; angeforderte Python-EXEs werden mit dem lokalen Builder gebaut.\r\n6. Stelex Admin.exe ist enthalten und durch den privaten Zugangscode geschützt; beide Apps teilen denselben lokalen Dienst.\r\n\r\nNeue STXO1-Codes sind offline auf anderen PCs einlösbar, einmal pro lokaler Datenbank; keine globale Sperre gegen Kopien. Konten und Protokolle bleiben lokal. Keine API-Schlüssel oder Admin-Token sind in diesem Paket enthalten.\r\n\r\nENGLISH\r\n1. Extract the complete ZIP. Do not copy the EXE on its own.\r\n2. Run Install.bat once. It configures the EXE builder and offline speech, then downloads and verifies all four chat models.\r\n3. Source: huihui_ai/qwen3.5-abliterated:9b; local alias: qwen3.5-abliterated:9b.\r\n4. Then launch Stelex GPT.exe. Missing models are shown with an installation hint.\r\n5. Choose an output folder using the folder button; generated files are saved automatically; requested Python EXEs are compiled with the local builder.\r\n6. Stelex Admin.exe is included, protected by its private unlock code; both apps share the same local service.\r\n\r\nNew STXO1 codes work offline on other PCs, once per local database with no global reuse prevention. Accounts and logs remain local. This package contains no API keys or admin tokens.\r\n\r\nSupport / Kauf / Purchase: https://discord.gg/stelex\r\n\r\nElectron ${electronVersion}; Node ${nodeVersion}. Windows execution must be verified on a Windows machine.\r\n`;
  await fs.writeFile(path.join(packageRoot, 'START-HERE.txt'), readme);
  const zipPath = path.join(artifactRoot, 'Stelex-GPT-Windows-x64.zip');
  console.log('Compressing Windows portable package…');
  await zipDirectory(packageRoot, zipPath);
  // Do not publish a stale package if another build or edit changed inputs
  // while the portable directory was being copied or compressed.
  for (const directory of ['dist', 'server', 'desktop','config']) {
    if (await treeFingerprint(path.join(root, directory)) !== await treeFingerprint(path.join(appDir, directory))) {
      await fs.rm(zipPath, { force: true });
      throw new Error(`${directory} changed during packaging. Finish the build/edits and rerun packaging.`);
    }
  }
  for (const file of extraFiles) {
    const optionalHash = async (location) => {
      try { return await sha256(location); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    if (await optionalHash(path.join(root, file)) !== await optionalHash(path.join(packageRoot, path.basename(file)))) {
      await fs.rm(zipPath, { force: true });
      throw new Error(`${file} changed during packaging. Finish edits and rerun packaging.`);
    }
  }
  const digest = await sha256(zipPath);
  await fs.writeFile(`${zipPath}.sha256`, `${digest}  ${path.basename(zipPath)}\n`);
  console.log(`Windows portable package: ${zipPath}`);
  console.log(`SHA-256: ${digest}`);
} finally {
  await dispatcher.close();
}
