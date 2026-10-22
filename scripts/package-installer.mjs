import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'artifacts', 'Stelex-GPT-Windows-x64');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Installer requires a numeric release version.');
const output = path.join(root, 'artifacts', 'Stelex-GPT-Setup-' + version + '.exe');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'stelex-installer-'));
const files = [], directories = [];
let bytes = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Installer payload must not contain symlinks.');
    if (entry.isDirectory()) { directories.push(full); await walk(full); }
    else if (entry.isFile()) { files.push(full); bytes += (await fs.stat(full)).size; }
  }
}
function windowsName(full) {
  return path.relative(packageDir, full).replaceAll(path.sep, '\\').replaceAll('$', '$$');
}
try {
  await fs.access(path.join(packageDir, 'Stelex GPT.exe'));
  await fs.access(path.join(packageDir, 'Stelex Admin.exe'));
  await walk(packageDir);
  const forbidden = files.filter(file => /(?:^|\/)(?:\.env|admin-token(?:\.txt)?|[^/]*\.sqlite(?:-wal|-shm)?)$/i.test(path.relative(packageDir, file).replaceAll('\\', '/')));
  if (forbidden.length) throw new Error('Installer payload contains private runtime files.');
  const manifest = path.join(temporary, 'uninstall-files.nsh');
  await fs.writeFile(manifest, [
    ...files.sort().map(file => `Delete "$INSTDIR\\${windowsName(file)}"`),
    ...directories.sort((a, b) => b.length - a.length).map(dir => `RMDir "$INSTDIR\\${windowsName(dir)}"`),
    '',
  ].join('\n'));
  const args = ['-WX', '-V3', '-DRELEASE_VERSION=' + version, `-DPACKAGE_DIR=${packageDir}`, `-DOUTPUT_FILE=${output}`, `-DICON_FILE=${path.join(root, 'desktop', 'assets', 'icon.ico')}`, `-DUNINSTALL_MANIFEST=${manifest}`, `-DESTIMATED_SIZE=${Math.ceil(bytes / 1024)}`, path.join(root, 'scripts', 'installer.nsi')];
  await new Promise((resolve, reject) => {
    const compiler = spawn(process.env.STELEX_MAKENSIS_PATH || 'makensis', args, { cwd: root, stdio: 'inherit' });
    compiler.on('error', reject);
    compiler.on('exit', code => code === 0 ? resolve() : reject(new Error(`NSIS failed (${code}).`)));
  });
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(output)) digest.update(chunk);
  const checksum = digest.digest('hex');
  await fs.writeFile(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`);
  console.log(`Installer: ${output}\nSHA-256: ${checksum}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
