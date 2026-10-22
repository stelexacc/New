import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import output from '../desktop/output-files.cjs';
const { MAX_ARTIFACT_BYTES, decodeArtifact, canonicalDirectory, saveArtifact } = output;

async function folder(t) {
  const directory = await mkdtemp(join(tmpdir(), 'stelex-output-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return canonicalDirectory(directory);
}

test('artifact names reject traversal, Windows device paths and alternate data streams', () => {
  for (const name of ['../evil.py', 'nested/file.py', 'nested\\file.py', 'C:\\file.py', 'file.py:stream', '..', 'NUL', 'com1.exe', 'foo.', 'foo ', '\0file']) {
    assert.throws(() => decodeArtifact({ name, content: 'test' }), /filename/);
  }
  assert.equal(decodeArtifact({ name: 'example.py', content: 'print("hello")' }).name, 'example.py');
});

test('artifact size and base64 decoding remain bounded and strict', () => {
  assert.throws(() => decodeArtifact({ name: 'x.exe', content: '@@==', encoding: 'base64' }), /base64/);
  assert.throws(() => decodeArtifact({ name: 'x.exe', content: 'a'.repeat(MAX_ARTIFACT_BYTES + 1) }), /10 MiB/);
  assert.throws(() => decodeArtifact({ name: 'x.py', content: 'x', encoding: 'hex' }), /encoding/);
  assert.deepEqual(decodeArtifact({ name: 'x.bin', content: 'AAEC/w==', encoding: 'base64' }).data, Buffer.from([0, 1, 2, 255]));
});

test('artifact saves bytes in the selected root and leaves no temporary files', async t => {
  const directory = await folder(t);
  const result = await saveArtifact(directory, { name: 'answer.py', content: 'print("Stelex")\n' });
  assert.equal(result.path, join(directory, 'answer.py'));
  assert.equal(await readFile(result.path, 'utf8'), 'print("Stelex")\n');
  assert.deepEqual(await readdir(directory), ['answer.py']);
});

test('overwrites require explicit confirmation and cancellation preserves the original', async t => {
  const directory = await folder(t);
  await writeFile(join(directory, 'answer.py'), 'old');
  assert.deepEqual(await saveArtifact(directory, { name: 'answer.py', content: 'new' }), { canceled: true });
  assert.equal(await readFile(join(directory, 'answer.py'), 'utf8'), 'old');
  const result = await saveArtifact(directory, { name: 'answer.py', content: 'new' }, async name => name === 'answer.py');
  assert.equal(result.bytes, 3);
  assert.equal(await readFile(result.path, 'utf8'), 'new');
});

test('a file changed during overwrite confirmation is not replaced', async t => {
  const directory = await folder(t);
  await writeFile(join(directory, 'answer.py'), 'old');
  await assert.rejects(saveArtifact(directory, { name: 'answer.py', content: 'new' }, async () => {
    await writeFile(join(directory, 'answer.py'), 'changed-by-another-app');
    return true;
  }), /changed while saving/);
  assert.equal(await readFile(join(directory, 'answer.py'), 'utf8'), 'changed-by-another-app');
});

test('symbolic link destinations cannot write outside the selected root', async t => {
  const directory = await folder(t);
  const outside = await folder(t);
  await writeFile(join(outside, 'private.py'), 'outside-original');
  await symlink(join(outside, 'private.py'), join(directory, 'answer.py'));
  await assert.rejects(saveArtifact(directory, { name: 'answer.py', content: 'new' }, async () => true), /regular file/);
  assert.equal(await readFile(join(outside, 'private.py'), 'utf8'), 'outside-original');
});

test('replacing the selected directory with a symbolic link forces a new choice', async t => {
  const parent = await folder(t);
  const directory = join(parent, 'selected');
  const outside = await folder(t);
  await symlink(outside, directory, 'dir');
  await assert.rejects(saveArtifact(directory, { name: 'answer.py', content: 'new' }), /folder changed/);
  assert.deepEqual(await readdir(outside), []);
});

test('two concurrent saves never silently overwrite a new filename', async t => {
  const directory = await folder(t);
  const results = await Promise.allSettled([
    saveArtifact(directory, { name: 'answer.py', content: 'first' }),
    saveArtifact(directory, { name: 'answer.py', content: 'second' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(['first', 'second'].includes(await readFile(join(directory, 'answer.py'), 'utf8')));
  assert.deepEqual(await readdir(directory), ['answer.py']);
});
