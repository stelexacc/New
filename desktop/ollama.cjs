'use strict';

const fs = require('node:fs/promises');
const DEFAULT_MODEL = 'huihui_ai/qwen3.5-abliterated:9b';
const validModel = value => typeof value === 'string' && value.length <= 256 && /^[a-zA-Z0-9_.:/@-]+$/.test(value);

function modelIds(value) {
  if (!value) return [];
  try {
    const parsed = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(item => typeof item === 'string' ? item.trim() : item?.id).filter(validModel))];
  } catch { return []; }
}

async function detectOllama({ env = process.env, preferredModelPath, fetchImpl = fetch } = {}) {
  const baseUrl = env.STELEX_AI_BASE_URL || 'http://127.0.0.1:11434/v1';
  const configured = modelIds(env.STELEX_AI_MODELS);
  let preferred = DEFAULT_MODEL;
  if (preferredModelPath) {
    try {
      const saved = JSON.parse((await fs.readFile(preferredModelPath, 'utf8')).replace(/^\uFEFF/, ''));
      if (validModel(saved.model)) preferred = saved.model;
    } catch { /* An absent or damaged preference must not prevent startup. */ }
  }
  const fallback = configured.length ? env.STELEX_AI_MODELS : preferred;
  if (env.STELEX_AI_BASE_URL) return { baseUrl, model: fallback, available: true };
  try {
    const response = await fetchImpl('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { baseUrl, model: fallback, available: false };
    const data = await response.json();
    const installed = [...new Set((Array.isArray(data.models) ? data.models : [])
      .map(entry => entry.name || entry.model).filter(validModel))].slice(0, 50);
    if (configured.length) {
      return { baseUrl, model: fallback, available: configured.every(id => installed.includes(id)) };
    }
    installed.sort((a, b) => Number(b === preferred) - Number(a === preferred) || a.localeCompare(b));
    return {
      baseUrl,
      model: installed.length ? JSON.stringify(installed.map(id => ({ id, name: id }))) : preferred,
      available: installed.length > 0,
    };
  } catch { return { baseUrl, model: fallback, available: false }; }
}

module.exports = { DEFAULT_MODEL, modelIds, detectOllama };
