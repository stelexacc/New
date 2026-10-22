import test from 'node:test';
import assert from 'node:assert/strict';
import output from '../desktop/output-files.cjs';

test('binary artifacts up to the full 10 MiB limit decode without stack overflow and reject noncanonical encodings', () => {
  const { MAX_ARTIFACT_BYTES, decodeArtifact } = output;
  const bytes = Buffer.alloc(MAX_ARTIFACT_BYTES);
  for (let offset = 0; offset < bytes.length; offset++) bytes[offset] = offset % 251;
  const artifact = decodeArtifact({ name: 'large-output.bin', content: bytes.toString('base64'), encoding: 'base64' });
  assert.equal(artifact.data.length, MAX_ARTIFACT_BYTES);
  assert.deepEqual(artifact.data, bytes);
  assert.throws(() => decodeArtifact({ name: 'too-large.bin', content: Buffer.alloc(MAX_ARTIFACT_BYTES + 1).toString('base64'), encoding: 'base64' }), /10 MiB|size|limit/i);
  for (const content of ['AB==', 'AAB=', 'AA==AAAA', 'AA=A', 'AAAA\n', '@@==']) {
    assert.throws(() => decodeArtifact({ name: 'invalid.bin', content, encoding: 'base64' }), /base64/i);
  }
});
