'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

function decodeArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid artifact.');
  const { name, content, encoding = 'utf8' } = value;
  if (typeof name !== 'string' || !name || name.length > 180 || /[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('Use a single filename without paths or reserved characters.');
  }
  if (typeof content !== 'string' || !['utf8', 'base64'].includes(encoding)) throw new Error('Invalid artifact content or encoding.');
  // Check before decoding to keep renderer-controlled allocations bounded.
  if (content.length > Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4) throw new Error('Artifact exceeds the 10 MiB limit.');
  if (encoding === 'base64') {
    if (content.length % 4 !== 0) throw new Error('Invalid base64 artifact.');
    const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
    // Repeated-group regular expressions overflow V8's stack on valid large
    // artifacts. Scan the bounded input directly before allocating its bytes.
    for (let index = 0; index < content.length - padding; index++) {
      const code = content.charCodeAt(index);
      if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) throw new Error('Invalid base64 artifact.');
    }
    if (content.length / 4 * 3 - padding > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the 10 MiB limit.');
  }
  const data = Buffer.from(content, encoding);
  if (data.length > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the 10 MiB limit.');
  if (encoding === 'base64' && data.toString('base64') !== content) throw new Error('Invalid base64 artifact.');
  return { name, data };
}

async function canonicalDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Choose an output folder first.');
  const real = await fs.realpath(directory);
  const stat = await fs.lstat(real);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The output folder is unavailable. Choose it again.');
  return real;
}

async function assertDirectoryUnchanged(directory) {
  const real = await canonicalDirectory(directory);
  if (real !== directory) throw new Error('The output folder changed. Choose it again.');
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) throw new Error('The output folder changed. Choose it again.');
}

async function entry(destination) {
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The destination is not a regular file. Choose a different name.');
    return stat;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function sameEntry(first, second) {
  return first && second && first.dev === second.dev && first.ino === second.ino && first.size === second.size && first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs;
}

async function saveArtifact(directory, value, confirmOverwrite = async () => false) {
  const { name, data } = decodeArtifact(value);
  await assertDirectoryUnchanged(directory);
  const destination = path.join(directory, name);
  const previous = await entry(destination);
  if (previous && !await confirmOverwrite(name)) return { canceled: true };
  await assertDirectoryUnchanged(directory);
  const latest = await entry(destination);
  if (previous ? !sameEntry(previous, latest) : latest !== null) throw new Error('The destination changed while saving. Retry with a different name.');

  const temporary = path.join(directory, `.stelex-${randomUUID()}.tmp`);
  let handle;
  try {
    // Exclusive creation prevents following an existing file or symbolic link.
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await assertDirectoryUnchanged(directory);
    const beforeCommit = await entry(destination);
    if (previous ? !sameEntry(previous, beforeCommit) : beforeCommit !== null) throw new Error('The destination changed while saving. Retry with a different name.');
    // Rename replaces the directory entry, never the contents of a symlink target.
    if (previous) await fs.rename(temporary, destination);
    else {
      // Link is an atomic no-replace commit. Another save cannot win this filename
      // between the final check and commit; no existing file is overwritten.
      await fs.link(temporary, destination);
      await fs.unlink(temporary);
    }
    return { path: destination, name, bytes: data.length };
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
}

module.exports = { MAX_ARTIFACT_BYTES, decodeArtifact, canonicalDirectory, saveArtifact };
