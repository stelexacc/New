import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'artifacts', 'Stelex-GPT-Windows-x64');
const artifactDir = path.join(root, 'artifacts');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Installer requires a numeric release version.');
const bootstrap = await fs.readFile(path.join(root, 'scripts', 'Install.bat'), 'utf8');
if (!bootstrap.includes(`$ReleaseVersion = '${version}'`)) throw new Error('Install.bat release version must match package.json.');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'stelex-installer-'));
let files = [], directories = [];
let activePackage = packageDir;
let bytes = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Installer payload must not contain symlinks.');
    if (entry.isDirectory()) { directories.push(full); await walk(full); }
    else if (entry.isFile()) { files.push(full); bytes += (await fs.stat(full)).size; }
  }
}
function windowsName(full) { return path.relative(activePackage, full).replaceAll(path.sep, '\\').replaceAll('$', '$$'); }
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function compile(output, adminOnly, manifest) {
  const prefix = process.platform === 'win32' ? '/' : '-';
  const args = [`${prefix}WX`, `${prefix}V3`, `${prefix}DRELEASE_VERSION=${version}`, `${prefix}DPACKAGE_DIR=${activePackage}`, `${prefix}DOUTPUT_FILE=${output}`, `${prefix}DICON_FILE=${path.join(root, 'desktop', 'assets', 'icon.ico')}`, `${prefix}DUNINSTALL_MANIFEST=${manifest}`, `${prefix}DESTIMATED_SIZE=${Math.ceil(bytes / 1024)}`];
  if (adminOnly) args.push(`${prefix}DADMIN_ONLY=1`);
  args.push(path.join(root, 'scripts', 'installer.nsi'));
  await fs.rm(output, { force: true });
  await fs.rm(`${output}.sha256`, { force: true });
  try {
    await new Promise((resolveCompile, reject) => {
      const compiler = spawn(process.env.STELEX_MAKENSIS_PATH || 'makensis', args, { cwd: root, stdio: 'inherit' });
      compiler.on('error', reject);
      compiler.on('exit', code => code === 0 ? resolveCompile() : reject(new Error(`NSIS failed (${code}).`)));
    });
    const checksum = await digest(output);
    await fs.writeFile(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`);
    console.log(`Installer: ${output}\nSHA-256: ${checksum}`);
  } catch (error) { await fs.rm(output, { force: true }); throw error; }
}
try {
  for (const file of ['Stelex GPT.exe', 'Setup-Ollama.ps1', 'Install.bat', 'resources/runtime/node.exe']) await fs.access(path.join(packageDir, file));
  const bundled = JSON.parse(await fs.readFile(path.join(packageDir, 'resources', 'app', 'package.json'), 'utf8'));
  if (bundled.version !== version) throw new Error('Windows payload is stale. Run npm run package:windows before building installers.');
  for (const script of ['Install.bat', 'Setup-Ollama.ps1']) {
    if (await digest(path.join(root, 'scripts', script)) !== await digest(path.join(packageDir, script))) throw new Error(`${script} changed after Windows packaging. Rebuild the Windows payload.`);
  }
  if (bundled.stelexRole !== 'combined') throw new Error('Customer payload has the wrong role.');
  for (const forbidden of ['resources/app/admin','resources/owner-admin-auth.json']) {
    try { await fs.access(path.join(packageDir,forbidden)); } catch(error) { if(error.code==='ENOENT') continue; throw error; }
    throw new Error('Customer package contains private admin files.');
  }
  await walk(packageDir);
  const forbidden = files.filter(file => /(?:^|\/)(?:\.env(?:\..*)?|admin-token(?:\.txt)?|[^/]*\.(?:sqlite|db)(?:-wal|-shm)?)$/i.test(path.relative(packageDir, file).replaceAll('\\', '/')));
  if (forbidden.length) throw new Error('Installer payload contains private runtime files.');
  const manifest = path.join(temporary, 'uninstall-files.nsh');
  await fs.writeFile(manifest, [...files.sort().map(file => `Delete "$INSTDIR\\${windowsName(file)}"`), ...directories.sort((a, b) => b.length - a.length).map(dir => `RMDir "$INSTDIR\\${windowsName(dir)}"`), ''].join('\n'));
  await compile(path.join(artifactDir, `Stelex-GPT-Setup-${version}.exe`), false, manifest);
  await fs.copyFile(path.join(root, 'scripts', 'Install.bat'), path.join(artifactDir, 'Install.bat'));
  await fs.writeFile(path.join(artifactDir, 'Install.bat.sha256'), `${await digest(path.join(artifactDir, 'Install.bat'))}  Install.bat\n`);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
