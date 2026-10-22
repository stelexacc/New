import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ollama from '../desktop/ollama.cjs';

const installed = ids => async () => new Response(JSON.stringify({ models: ids.map(name => ({ name })) }));

test('preferred Ollama model is selected first and existing models remain available', async () => {
  const result = await ollama.detectOllama({ env: {}, fetchImpl: installed(['qwen2.5-coder:1.5b', ollama.DEFAULT_MODEL]) });
  assert.equal(result.available, true);
  assert.deepEqual(JSON.parse(result.model).map(model => model.id), [ollama.DEFAULT_MODEL, 'qwen2.5-coder:1.5b']);
});

test('an unavailable or failing Ollama instance is never treated as a live model', async () => {
  for (const fetchImpl of [installed([]), async () => new Response('{}', { status: 503 }), async () => { throw new Error('offline'); }]) {
    assert.equal((await ollama.detectOllama({ env: {}, fetchImpl })).available, false);
  }
  const configured = await ollama.detectOllama({ env: { STELEX_AI_MODELS: ollama.DEFAULT_MODEL }, fetchImpl: installed(['other:latest']) });
  assert.equal(configured.available, false);
});

test('setup preference survives restart, malformed preference falls back safely', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'stelex-model-'));
  const preferredModelPath = path.join(temporary, 'ollama-model.json');
  try {
    await writeFile(preferredModelPath, '\uFEFF' + JSON.stringify({ model: 'custom:9b' }));
    const result = await ollama.detectOllama({ env: {}, preferredModelPath, fetchImpl: installed(['other:latest', 'custom:9b']) });
    assert.equal(JSON.parse(result.model)[0].id, 'custom:9b');
    await writeFile(preferredModelPath, 'invalid json');
    assert.equal((await ollama.detectOllama({ env: {}, preferredModelPath, fetchImpl: installed([]) })).model, ollama.DEFAULT_MODEL);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
