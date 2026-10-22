import { createApp } from './app.mjs';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const dataDir = resolve(process.env.STELEX_DATA_DIR || '.data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const adminEnabled = process.env.STELEX_ADMIN_DISABLED !== 'true';
let adminCodeHash = process.env.STELEX_ADMIN_CODE_HASH;
if (adminEnabled && !adminCodeHash) {
  try { adminCodeHash = JSON.parse(readFileSync(resolve(dataDir, 'admin-auth.json'), 'utf8')).codeHash; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
let adminToken = adminEnabled && !adminCodeHash ? process.env.STELEX_ADMIN_TOKEN : undefined;
if (adminEnabled && !adminCodeHash && !adminToken) {
  const tokenPath = resolve(dataDir, 'admin-token.txt');
  try { adminToken = readFileSync(tokenPath, 'utf8').trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    adminToken = randomBytes(32).toString('hex');
    writeFileSync(tokenPath, adminToken, { mode: 0o600, flag: 'wx' });
  }
  if (!adminToken) throw new Error('Administrator token file is empty.');
  chmodSync(tokenPath, 0o600);
}
let models;
if (process.env.STELEX_AI_MODELS) {
  const value = process.env.STELEX_AI_MODELS.trim();
  models = value.startsWith('[') ? JSON.parse(value) : value.split(',').map(id => ({ id: id.trim(), name: id.trim() })).filter(model => model.id);
}
const demoMode = process.env.STELEX_DEMO_MODE === undefined ? !process.env.STELEX_AI_BASE_URL : process.env.STELEX_DEMO_MODE === 'true';
const port = Number(process.env.STELEX_PORT ?? 4318);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('STELEX_PORT must be 0–65535.');
const app = await createApp({
  dbPath: resolve(dataDir, 'stelex.sqlite'), adminToken, adminCodeHash, adminEnabled, demoMode, models,
  aiBaseUrl: process.env.STELEX_AI_BASE_URL, aiApiKey: process.env.STELEX_AI_API_KEY,
  initialCredits: process.env.STELEX_INITIAL_CREDITS === undefined ? undefined : Number(process.env.STELEX_INITIAL_CREDITS),
  publicUrl: process.env.STELEX_PUBLIC_ORIGIN || process.env.STELEX_PUBLIC_URL,
  secureCookies: process.env.STELEX_SECURE_COOKIES === 'true',
  trustProxyLoopback: process.env.STELEX_TRUST_PROXY_LOOPBACK === 'true',
  providerConcurrency: Number(process.env.STELEX_PROVIDER_CONCURRENCY || 2),
  smtp: process.env.STELEX_SMTP_HOST && process.env.STELEX_SMTP_FROM ? {
    host:process.env.STELEX_SMTP_HOST,port:Number(process.env.STELEX_SMTP_PORT || 587),
    secure:process.env.STELEX_SMTP_SECURE === 'true',user:process.env.STELEX_SMTP_USER,
    password:process.env.STELEX_SMTP_PASSWORD,from:process.env.STELEX_SMTP_FROM,
  } : undefined,
});
const address = await app.listen(port, process.env.STELEX_HOST || '127.0.0.1');
console.log(`STELEX_READY=${address}`);
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (closing) return; closing = true;
  await app.close(); process.exit(0);
});
