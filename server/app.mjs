import http from 'node:http';
import {createIntegrations} from './integrations.mjs';
import {reviewAnswer} from './reviewer.mjs';
import {mintOfflineCode,verifyOfflineCode} from './offline-codes.mjs';
import {importLegacyAdmin} from './legacy-admin.mjs';
import { ollamaChat } from './ollama.mjs';
import { migrateWelcomeGift } from './welcome-migration.mjs';
import { adminVerifier } from './admin-auth.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, randomInt, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createProviderScheduler } from './scheduler.mjs';
import { initializePrompts, validPromptSettings, DEFAULT_SYSTEM_PROMPT, MAX_SYSTEM_PROMPT_LENGTH } from './prompts.mjs';
import { initializePlans, validateCatalog, quotaWindow, publicQuota, restoreQuota } from './plans.mjs';
import { initializeAttachments, validateAttachments, providerContent, estimatedMessageTokens } from './attachments.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PER_CREDIT = 100;
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = () => new Date().toISOString();
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const publicModel = ({ id, name, description, tier = 0, multiplier = 1, vision = false,available=true,contextWindow }) => ({ id, name, description, tier, multiplier,available,contextWindow, vision:Boolean(vision), attachments:{text:true,images:Boolean(vision)} });
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.emailVerified) });

class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') { super(message); this.status = status; this.code = code; }
}

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hex, 'hex'));
}

async function readJson(request, maximumBytes = 96 * 1024) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.', 'CONTENT_TYPE');
  }
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new HttpError(413, 'Request is too large.', 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON.', 'INVALID_JSON'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(400, 'Expected a JSON object.');
  return body;
}

function serveFile(response, path, head = false) {
  try {
    if (!statSync(path).isFile()) return false;
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
    response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream', 'Cache-Control': path.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    response.end(head ? undefined : readFileSync(path)); return true;
  } catch { return false; }
}

function acquireDatabaseLock(dbPath) {
  if (dbPath === ':memory:') return () => {};
  const absolute = resolve(dbPath);
  const canonical = existsSync(absolute) ? realpathSync(absolute) : resolve(realpathSync(dirname(absolute)), basename(absolute));
  const lockPath = `${canonical}.lock`;
  const recoveryPath = `${lockPath}.recovery`;
  const owner = { pid: process.pid, nonce: randomUUID() };
  // Serializing acquisition also makes stale-file removal safe between contenders.
  try { writeFileSync(recoveryPath, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Database lock acquisition is already in progress: ${recoveryPath}. Retry after the other process finishes; an abandoned recovery guard must be inspected before removal.`);
    throw error;
  }
  try {
    try { writeFileSync(lockPath, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try { previous = JSON.parse(readFileSync(lockPath, 'utf8')); }
      catch { throw new Error(`Database lock is unreadable; refusing to overwrite it: ${lockPath}`); }
      if (!integer(previous.pid, 1, 2_147_483_647) || typeof previous.nonce !== 'string') throw new Error(`Database lock is invalid; refusing to overwrite it: ${lockPath}`);
      let alive = true;
      try { process.kill(previous.pid, 0); }
      catch (signalError) { if (signalError.code === 'ESRCH') alive = false; else if (signalError.code !== 'EPERM') throw signalError; }
      if (alive) throw new Error(`Database is already in use by process ${previous.pid}: ${canonical}`);
      unlinkSync(lockPath);
      writeFileSync(lockPath, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
    }
  } finally { unlinkSync(recoveryPath); }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (current.pid === owner.pid && current.nonce === owner.nonce) unlinkSync(lockPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}

export async function createApp(options = {}) {
  const dbPath = options.dbPath || ':memory:';
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true, mode: 0o700 });
  const releaseLock = acquireDatabaseLock(dbPath);
  let db; let dispatcher;
  try {
  db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0), createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT NOT NULL, model TEXT);
    CREATE TABLE IF NOT EXISTS credit_keys (id TEXT PRIMARY KEY, codeHash TEXT UNIQUE NOT NULL, credits INTEGER NOT NULL CHECK(credits > 0), note TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL, redeemedAt TEXT, redeemedBy TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, credits INTEGER NOT NULL, balance INTEGER NOT NULL, createdAt TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), model TEXT NOT NULL, inputTokens INTEGER NOT NULL, outputTokens INTEGER NOT NULL, credits INTEGER NOT NULL, demo INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), credits INTEGER NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_requests (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, requestId TEXT NOT NULL, inputHash TEXT NOT NULL, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, response TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(userId,requestId));
    CREATE INDEX IF NOT EXISTS conversations_user ON conversations(userId, updatedAt);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId, createdAt);
    CREATE INDEX IF NOT EXISTS usage_user ON usage(userId);
  `);
  db.exec('CREATE TABLE IF NOT EXISTS message_metrics(messageId TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,elapsedMs INTEGER NOT NULL)');
  const plans = initializePlans(db);
  const integrations=createIntegrations({db,dataDirectory:dbPath===':memory:'?null:dirname(resolve(dbPath)),fetchImpl:options.githubFetch||fetch});
  importLegacyAdmin(db,options.legacyAdminDb);
  const prompts = initializePrompts(db);
  const offlinePublicKey=options.offlinePublicKey;
  const signingKey=()=>{if(!options.offlinePrivateKeyFile)return null;try{return readFileSync(options.offlinePrivateKeyFile,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const attachments = initializeAttachments(db);
  const quotasEnabled = options.quotasEnabled !== false;
  // Run one backend process per database. Recover interrupted requests on restart.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of db.prepare('SELECT userId, SUM(credits) credits FROM reservations GROUP BY userId').all()) db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(item.credits, item.userId);
    for (const item of db.prepare('SELECT * FROM reservations').all()) restoreQuota(db,item,item.quotaUnits);
    db.exec('DELETE FROM reservations; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const demoMode = options.demoMode ?? !options.aiBaseUrl;
  if(options.removeLegacyWelcomeGift) migrateWelcomeGift(db);
  const initialCredits = options.initialCredits ?? 0;
  if (!integer(initialCredits, 0, 1_000_000_000)) throw new Error('Invalid initialCredits');
  const baseUrl = options.aiBaseUrl?.replace(/\/+$/, '');
  const models = options.models?.length ? options.models : demoMode
    ? [{ id: 'stelex-fast', name: 'Stelex Fast', description: 'Demo', tier: 0, multiplier: 1, vision:true }, { id: 'stelex-pro', name: 'Stelex Pro', description: 'Demo', tier: 2, multiplier: 2, vision:true }]
    : [{ id: 'qwen3.5-abliterated:9b', name: 'Qwen 3.5 Abliterated · 9B', vision:false }];
  if (models.some(m => typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || !integer(m.tier ?? 0,0,3) || typeof (m.multiplier ?? 1) !== 'number' || !Number.isFinite(m.multiplier ?? 1) || (m.multiplier ?? 1) < 1 || (m.multiplier ?? 1) > 100 || (m.vision !== undefined && typeof m.vision !== 'boolean'))) throw new Error('Invalid models');
  let mailTransport;
  let sendVerification = options.sendVerification;
  if (!sendVerification && options.smtp?.host && options.smtp?.from) {
    const { default: nodemailer } = await import('nodemailer');
    const smtp = options.smtp;
    mailTransport = nodemailer.createTransport({host:smtp.host,port:smtp.port || 587,secure:Boolean(smtp.secure),auth:smtp.user ? {user:smtp.user,pass:smtp.password} : undefined,connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000});
    sendVerification = ({email,name,code}) => mailTransport.sendMail({from:smtp.from,to:email,subject:'Stelex – E-Mail bestätigen',text:`Hallo ${name},\n\ndein Stelex-Bestätigungscode: ${code}\n\nDer Code gilt 10 Minuten. Falls du kein Konto erstellt hast, ignoriere diese Nachricht.`});
  }
  const verificationEnabled = typeof sendVerification === 'function';
  let verifyAdmin = adminVerifier(options);
  const progress=new Map();
  const setProgress=(userId,requestId,update)=>{if(!requestId)return;const key=`${userId}:${requestId}`;for(const [id,value] of progress)if(Date.now()-value.updatedAt>600000)progress.delete(id);if(progress.size>512)progress.delete(progress.keys().next().value);progress.set(key,{...progress.get(key),...update,updatedAt:Date.now()});};
  const rateLimits = new Map(); const busyUsers = new Set();
  const providerScheduler=createProviderScheduler(options.providerConcurrency ?? 2);
  const providerShutdown=new AbortController();
  let lastLocalModel=null;
  let providerObservation = { reachable: null, checkedAt: null };
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    try { const { EnvHttpProxyAgent } = await import('undici'); dispatcher = new EnvHttpProxyAgent(); }
    catch { /* Built-in fetch remains usable when no proxy dependency is installed. */ }
  }
  const fetchProvider = (url, init) => {
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
    return (options.fetchImpl || fetch)(url, { ...init, ...(dispatcher && !loopback ? { dispatcher } : {}) });
  };
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const recordLedger = (userId, type, credits, balance, note = '') => db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(), userId, type, credits, balance, iso(), note);
  const getUsage = userId => {
    const totals = db.prepare('SELECT COALESCE(SUM(credits),0) creditsUsed, COUNT(*) responses, COALESCE(SUM(inputTokens),0) inputTokens, COALESCE(SUM(outputTokens),0) outputTokens FROM usage WHERE userId=?').get(userId);
    const byModel = db.prepare('SELECT model, COUNT(*) responses, SUM(inputTokens) inputTokens, SUM(outputTokens) outputTokens, SUM(credits) creditsUsed FROM usage WHERE userId=? GROUP BY model').all(userId);
    return { ...totals, byModel };
  };
  const accountState = userId => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    const plan = plans.effectivePlan(user);
    const item = quotaWindow(db,user.id,plan);
    return {user:publicUser(user),balance:user.balance,usage:getUsage(user.id),demoMode,verificationEnabled,verificationRequired:verificationEnabled && !user.emailVerified,
      subscription:{planId:plan.id,planName:plan.name,expiresAt:plan.id === 'free' ? null : user.planExpiresAt ? new Date(user.planExpiresAt).toISOString() : null},
      quota:publicQuota(item,plan),entitlements:{modelTier:plan.modelTier,reasoningEffort:plan.reasoningEffort,maxOutputTokens:plan.maxOutputTokens,priority:plan.priority},
      availableModels:models.filter(model => (model.tier ?? 0) <= plan.modelTier).map(publicModel)};
  };
  const operatorUser = user => {
    const plan=plans.effectivePlan(user);
    return {...publicUser(user),balance:user.balance,subscription:{planId:plan.id,planName:plan.name,expiresAt:plan.id==='free'||!user.planExpiresAt?null:new Date(user.planExpiresAt).toISOString()}};
  };
  const deliverVerification = async user => {
    const code = String(randomInt(100000,1000000));
    const expiresAt = Date.now()+600_000;
    db.prepare('INSERT INTO email_verifications VALUES(?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET codeHash=excluded.codeHash,expiresAt=excluded.expiresAt,attempts=0,sentAt=excluded.sentAt').run(user.id,hash(`${user.id}:${code}`),expiresAt,0,Date.now());
    try { await sendVerification({email:user.email,name:user.name,code,expiresAt:new Date(expiresAt).toISOString()}); }
    catch { db.prepare('DELETE FROM email_verifications WHERE userId=?').run(user.id); throw new HttpError(503,'Verification email could not be sent. Please retry later.','EMAIL_DELIVERY_FAILED'); }
  };
  const currentUser = request => {
    const token = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('stelex_session='))?.slice(15);
    if (!token) throw new HttpError(401, 'Please sign in.', 'AUTH_REQUIRED');
    const user = db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?').get(hash(token), Date.now());
    if (!user) throw new HttpError(401, 'Session expired. Please sign in.', 'AUTH_REQUIRED');
    return user;
  };
  const requireAdmin = request => {
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
    if (!verifyAdmin(token)) throw new HttpError(401, 'Invalid administrator token.', 'ADMIN_REQUIRED');
  };
  const clientAddress = request => {
    const remote = request.socket.remoteAddress || 'unknown';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (options.trustProxyLoopback && loopback) {
      // A local reverse proxy must append its actual peer address to X-Forwarded-For.
      const forwarded = request.headers['x-forwarded-for'];
      const rightmost = typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : '';
      if (isIP(rightmost)) return rightmost;
    }
    return remote;
  };
  const limit = (request, action, max, duration = 60_000, scope) => {
    const key = `${scope || clientAddress(request)}:${action}`;
    let item = rateLimits.get(key);
    if (!item || item.resetAt < Date.now()) item = { count: 0, resetAt: Date.now() + duration };
    item.count++; rateLimits.set(key, item);
    if (rateLimits.size > 10_000) for (const [entry, value] of rateLimits) if (value.resetAt < Date.now()) rateLimits.delete(entry);
    if (item.count > max) throw new HttpError(429, 'Too many requests. Please wait before retrying.', 'RATE_LIMITED');
  };
  const sessionCookie = (request, token, expired = false, remember = true) => `stelex_session=${token}; HttpOnly; SameSite=Strict; Path=/${expired ? '; Max-Age=0' : remember ? `; Max-Age=${SESSION_AGE / 1000}` : ''}${options.secureCookies || options.publicUrl?.startsWith('https:') || request.socket.encrypted ? '; Secure' : ''}`;
  const providerKind = demoMode ? 'demo' : /(?:127\.0\.0\.1|localhost|\[::1\]):11434/.test(baseUrl || '') ? 'ollama' : 'openai-compatible';
  const checkProvider = async () => {
    if (demoMode) return;
    if (providerObservation.checkedAt && Date.now() - Date.parse(providerObservation.checkedAt) < 15_000) return;
    try {
      const result = await fetchProvider(`${baseUrl}/models`, { headers: options.aiApiKey ? { Authorization: `Bearer ${options.aiApiKey}` } : {}, signal: AbortSignal.timeout(2500) });
      providerObservation = { reachable: result.ok, checkedAt: iso() }; await result.body?.cancel();
    } catch { providerObservation = { reachable: false, checkedAt: iso() }; }
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const json = (status, data, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); response.end(JSON.stringify(data)); };
    try {
      const url = new URL(request.url, 'http://localhost'); const path = url.pathname; const method = request.method;
      if (path.startsWith('/api/')) {
        response.setHeader('Cache-Control', 'no-store');
        const host = request.headers.host;
        let requestHost;
        try { requestHost = new URL(`http://${host}`).hostname; } catch { throw new HttpError(400, 'Invalid host.'); }
        const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(requestHost);
        const configuredOrigin = options.publicUrl ? new URL(options.publicUrl).origin : null;
        if (!localHost && (!configuredOrigin || host !== new URL(configuredOrigin).host)) throw new HttpError(403, 'Host is not allowed.', 'HOST_REJECTED');
        const origin = request.headers.origin;
        if (origin) {
          const allowed = new Set(configuredOrigin ? [configuredOrigin] : [`http://${host}`, `https://${host}`]);
          if (!allowed.has(origin)) throw new HttpError(403, 'Cross-origin requests are not allowed.', 'ORIGIN_REJECTED');
        }
        if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.', 'ORIGIN_REJECTED');
      }
      if(path.startsWith('/api/desktop/')) {
        if(!options.desktopKey || request.headers.authorization!==`Bearer ${options.desktopKey}` || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress))throw new HttpError(403,'Local service control denied.','FORBIDDEN');
        if(method==='POST' && path==='/api/desktop/reload-admin'){
          const config=JSON.parse(readFileSync(options.adminAuthFile,'utf8'));
          verifyAdmin=adminVerifier({adminCodeHash:config.codeHash});return json(200,{ok:true});
        }
        if(method==='POST' && path==='/api/desktop/lease'){const body=await readJson(request);options.desktopLease?.(body.clientId,body.release===true);return json(200,{ok:true});}
        throw new HttpError(404,'Not found.','NOT_FOUND');
      }
      if(method==='GET' && path==='/api/chat/status'){
        const user=currentUser(request);const state=progress.get(`${user.id}:${url.searchParams.get('requestId')}`);return json(200,state||{stage:'preparing'});
      }
      if (method === 'GET' && path === '/api/plans') return json(200,{...plans.catalog,verificationEnabled});
      if (method === 'GET' && path === '/api/health') {
        await checkProvider();
        return json(200, { ok: true, serviceId:options.serviceId || null, version:'1.8.0', demoMode, models: models.map(publicModel), tokensPerCredit: TOKENS_PER_CREDIT, provider: { kind: providerKind, configured: !demoMode, ...providerObservation } });
      }
      if (method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path)) {
        limit(request, 'auth-ip', 300);
        const body = await readJson(request);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = body.password;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 128) throw new HttpError(400, 'Use a valid email and a password of 10–128 characters.', 'INVALID_CREDENTIALS');
        limit(request, 'auth-account', 15, 60_000, `account:${hash(email)}`);
        let user;
        if (path.endsWith('/register')) {
          limit(request, 'register', 100, 3_600_000);
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : email.split('@')[0];
          if (!name) throw new HttpError(400, 'Name is required.');
          if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new HttpError(409, 'An account already exists for this email.', 'EMAIL_EXISTS');
          const id = randomUUID();
          transaction(() => {
            db.prepare('INSERT INTO users(id,email,name,password,balance,createdAt) VALUES(?,?,?,?,?,?)').run(id, email, name, passwordHash(password), initialCredits, iso());
            if (initialCredits) recordLedger(id, 'welcome', initialCredits, initialCredits, demoMode ? 'Demo starting balance' : 'Starting balance');
          });
          user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
        } else {
          user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
          if (!user || !verifyPassword(password, user.password)) { plans.audit('login_failed',null,{email}); throw new HttpError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS'); }
        }
        plans.audit(path.endsWith('/register') ? 'registration' : 'login',user);
        let verificationDeliveryFailed = false;
        if (verificationEnabled && !user.emailVerified) {
          const pending = db.prepare('SELECT sentAt FROM email_verifications WHERE userId=?').get(user.id);
          if (!pending || pending.sentAt < Date.now()-60_000) {
            try { await deliverVerification(user); } catch { verificationDeliveryFailed=true; }
          }
        }
        const token = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + SESSION_AGE);
        return json(200, { ...accountState(user.id),verificationDeliveryFailed }, { 'Set-Cookie': sessionCookie(request, token, false, body.remember === true) });
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        const token = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('stelex_session='))?.slice(15);
        if (token) { const session=db.prepare('SELECT userId FROM sessions WHERE tokenHash=?').get(hash(token)); if (session) plans.audit('logout',db.prepare('SELECT * FROM users WHERE id=?').get(session.userId)); db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hash(token)); }
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '', true) });
      }
      if (path.startsWith('/api/admin/')) {
        if (options.adminEnabled === false) throw new HttpError(404, 'Not found.', 'NOT_FOUND');
        limit(request, 'admin', 100);
        try { requireAdmin(request); } catch(error) {if(path === '/api/admin/login' && method === 'POST') plans.audit('admin_login_failed',null);throw error;}
        if(path === '/api/admin/login' && method === 'POST') { plans.audit('admin_login',null);return json(200,{ok:true}); }
        if (path === '/api/admin/ai-settings' && ['GET','PUT'].includes(method)) {
          if (method === 'PUT') {
            const body=await readJson(request);
            if (typeof body.systemPrompt !== 'string' || !body.systemPrompt.trim() || body.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) throw new HttpError(400,'Use a non-empty system prompt of at most 16,000 characters.','INVALID_SYSTEM_PROMPT');
            prompts.saveSystemPrompt(body.systemPrompt);
          }
          return json(200,{systemPrompt:prompts.systemPrompt,defaultSystemPrompt:DEFAULT_SYSTEM_PROMPT,provider:{kind:providerKind,models:models.map(model => ({...publicModel(model),configuredModel:model.upstreamModel || model.id}))},defaultModelId:models[0].id});
        }
        if (method === 'GET' && path === '/api/admin/users') {
          const query=(url.searchParams.get('query')||'').trim();
          if (query.length>254) throw new HttpError(400,'Search text is too long.');
          const search=`%${query.toLowerCase().replace(/[\\%_]/g,'\\$&')}%`;
          const users=db.prepare("SELECT * FROM users WHERE LOWER(email) LIKE ? ESCAPE '\\' OR LOWER(name) LIKE ? ESCAPE '\\' ORDER BY createdAt DESC LIMIT 50").all(search,search);
          return json(200,{users:users.map(operatorUser)});
        }
        if (method === 'POST' && path === '/api/admin/grants') {
          const {userId,planId,durationDays=30,reason='',requestId}=await readJson(request);
          if (typeof userId!=='string'||typeof planId!=='string'||!integer(durationDays,1,366)||typeof reason!=='string'||reason.length>200||typeof requestId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new HttpError(400,'Use a valid account, paid plan, duration and request UUID.','INVALID_GRANT');
          const normalizedId=requestId.toLowerCase(),inputHash=hash(JSON.stringify({userId,planId,durationDays,reason}));
          const result=transaction(()=>{
            const previous=db.prepare('SELECT inputHash,response FROM admin_grants WHERE requestId=?').get(normalizedId);
            if(previous){if(previous.inputHash!==inputHash)throw new HttpError(409,'This grant request ID was already used with different details.','REQUEST_ID_REUSED');return JSON.parse(previous.response);}
            const user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
            if(!user)throw new HttpError(404,'Account not found.','NOT_FOUND');
            const plan=plans.catalog.plans.find(item=>item.id===planId&&item.id!=='free');
            if(!plan)throw new HttpError(400,'Choose Starter, Pro or Max.','INVALID_GRANT');
            const time=Date.now(),start=user.planId===planId&&user.planExpiresAt>time?user.planExpiresAt:time;
            const expiresAt=start+durationDays*86_400_000;
            db.prepare('UPDATE users SET planId=?,planExpiresAt=? WHERE id=?').run(planId,expiresAt,userId);
            plans.audit('plan_granted',user,{planId,durationDays,reason,expiresAt:new Date(expiresAt).toISOString()});
            const response={ok:true,user:operatorUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId))};
            db.prepare('INSERT INTO admin_grants VALUES(?,?,?,?)').run(normalizedId,inputHash,JSON.stringify(response),iso());
            return response;
          });
          return json(200,result);
        }
        if (path === '/api/admin/plans' && method === 'GET') return json(200,{...plans.catalog,verificationEnabled});
        if (path === '/api/admin/plans' && method === 'PUT') {
          const next = await readJson(request);
          if (!validateCatalog(next)) throw new HttpError(400,'Invalid plan or credit pack configuration.','INVALID_PLAN_CONFIGURATION');
          transaction(() => { plans.save({plans:next.plans,creditPacks:next.creditPacks}); plans.audit('plans_updated',null,{planIds:next.plans.map(plan => plan.id)}); });
          return json(200,{...plans.catalog,verificationEnabled});
        }
        if (path === '/api/admin/events' && method === 'GET') {
          const count=Number(url.searchParams.get('limit') ?? 100),offset=Number(url.searchParams.get('offset') ?? 0);
          if (!integer(count,1,500) || !integer(offset,0,1_000_000)) throw new HttpError(400,'Invalid pagination.');
          const events=db.prepare('SELECT id,type,userId,email,createdAt,details FROM audit_events ORDER BY rowid DESC LIMIT ? OFFSET ?').all(count,offset).map(event => ({...event,details:JSON.parse(event.details)}));
          return json(200,{events,total:db.prepare('SELECT COUNT(*) total FROM audit_events').get().total});
        }
        if (method === 'POST' && path === '/api/admin/keys') {
          const body=await readJson(request);
          const { count = 1, note = '', type = 'credits',planId }=body;
          const plan=plans.catalog.plans.find(item => item.id === planId && item.id !== 'free');
          const durationDays=body.durationDays ?? plan?.durationDays;
          const credits=type === 'plan' ? 1 : body.credits;
          if (!['credits','plan'].includes(type) || !integer(credits,1,1_000_000_000) || !integer(count,1,100) || typeof note !== 'string' || note.length > 200 || (type === 'plan' && (!plan || !integer(durationDays,1,366)))) throw new HttpError(400,'Use valid credits or a paid plan, and 1–100 keys.','INVALID_KEY_AMOUNT');
          const privateKey=signingKey();
          const keys = transaction(() => {
            const generated=Array.from({ length: count }, () => {
              const code=privateKey ? mintOfflineCode(privateKey,{type,credits:type==='plan'?0:credits,planId,durationDays}).code : `STX-${randomBytes(20).toString('hex').toUpperCase().match(/.{1,8}/g).join('-')}`;
              const key={id:randomUUID(),code,credits:type === 'plan' ? 0 : credits,type,planId:type === 'plan' ? planId : null,durationDays:type === 'plan' ? durationDays : null,createdAt:iso(),note};
              db.prepare('INSERT INTO credit_keys(id,codeHash,credits,note,createdAt,type,planId,durationDays) VALUES(?,?,?,?,?,?,?,?)').run(key.id,hash(code),credits,note,key.createdAt,type,key.planId,key.durationDays);
              return key;
            });
            plans.audit('codes_created',null,{type,count,credits:type === 'credits' ? credits : 0,planId:type === 'plan' ? planId : null});
            return generated;
          });
          return json(201,{keys});
        }
        if (method === 'GET' && path === '/api/admin/keys') return json(200,{keys:db.prepare("SELECT id,CASE WHEN type='plan' THEN 0 ELSE credits END credits,type,planId,durationDays,note,createdAt,redeemedAt,redeemedBy,CASE WHEN redeemedAt IS NULL THEN 'available' ELSE 'redeemed' END status FROM credit_keys ORDER BY createdAt DESC LIMIT 500").all()});
        if (method === 'GET' && path === '/api/admin/stats') {
          const keys=db.prepare("SELECT COUNT(*) keys,COALESCE(SUM(CASE WHEN redeemedAt IS NULL THEN 1 ELSE 0 END),0) unredeemedKeys,COALESCE(SUM(CASE WHEN type='credits' THEN credits ELSE 0 END),0) creditsIssued,COALESCE(SUM(CASE WHEN type='credits' AND redeemedAt IS NOT NULL THEN credits ELSE 0 END),0) creditsRedeemed FROM credit_keys").get();
          return json(200,{users:db.prepare('SELECT COUNT(*) total FROM users').get().total,...keys});
        }
        throw new HttpError(404, 'Endpoint not found.', 'NOT_FOUND');
      }
      if (path.startsWith('/api/')) {
        const user = currentUser(request);
        if(path==='/api/integrations' && method==='GET')return json(200,integrations.state(user.id));
        if(path==='/api/integrations' && method==='PUT')return json(200,await integrations.configure(user.id,await readJson(request),models));
        if(path==='/api/github/repos' && method==='GET')return json(200,await integrations.repos(user.id));
        if(path==='/api/github/tree' && method==='GET')return json(200,await integrations.tree(user.id,url.searchParams.get('repository'),url.searchParams.get('ref')));
        if(path==='/api/github/file' && method==='GET')return json(200,await integrations.file(user.id,url.searchParams.get('repository'),url.searchParams.get('path'),url.searchParams.get('ref')));
        if(path==='/api/github/proposals' && method==='POST')return json(200,integrations.propose(user.id,await readJson(request,1100000)));
        if(path==='/api/github/confirm' && method==='POST')return json(200,await integrations.confirm(user.id,(await readJson(request)).proposalId));
        if (method === 'GET' && path === '/api/me') return json(200,accountState(user.id));
        const attachmentMatch=path.match(/^\/api\/attachments\/([a-f0-9-]{36})$/);
        if (attachmentMatch && method==='GET') {
          const item=attachments.owned(attachmentMatch[1],user.id);
          if(!item)throw new HttpError(404,'Attachment not found.','NOT_FOUND');
          const bytes=Buffer.from(item.content,item.encoding==='base64'?'base64':'utf8');
          response.writeHead(200,{'Content-Type':item.mime,'Content-Length':bytes.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,'Cache-Control':'no-store'});
          return response.end(bytes);
        }
        if (path === '/api/preferences' && ['GET','PUT'].includes(method)) {
          if (method === 'PUT') {
            const body=await readJson(request);
            if (!validPromptSettings(body)) throw new HttpError(400,'Each instruction field must be text of at most 8,000 characters.','INVALID_PROMPT_SETTINGS');
            return json(200,prompts.savePreferences(user.id,body));
          }
          return json(200,prompts.readPreferences(user.id));
        }
        const instructionMatch=path.match(/^\/api\/conversations\/([a-f0-9-]{36})\/instructions$/);
        if (instructionMatch && ['GET','PATCH'].includes(method)) {
          const conversation=db.prepare('SELECT id FROM conversations WHERE id=? AND userId=?').get(instructionMatch[1],user.id);
          if (!conversation) throw new HttpError(404,'Conversation not found.','NOT_FOUND');
          if (method === 'PATCH') {
            if (busyUsers.has(user.id)) throw new HttpError(409,'A response is still generating.','CHAT_BUSY');
            const body=await readJson(request);
            if (body.override === false) prompts.saveConversation(conversation.id,{override:false});
            else {
              if (!validPromptSettings(body,true)) throw new HttpError(400,'Use override=true and text fields of at most 8,000 characters, or override=false to inherit.','INVALID_PROMPT_SETTINGS');
              prompts.saveConversation(conversation.id,body);
            }
          }
          return json(200,prompts.readConversation(user.id,conversation.id));
        }
        if (path === '/api/auth/resend' && method === 'POST') {
          if (!verificationEnabled) throw new HttpError(409,'Email verification is not configured.','VERIFICATION_DISABLED');
          if (user.emailVerified) return json(200,{...accountState(user.id),ok:true});
          limit(request,'email-resend',5,3_600_000,`user:${user.id}`);
          const pending=db.prepare('SELECT sentAt FROM email_verifications WHERE userId=?').get(user.id);
          if (pending && pending.sentAt > Date.now()-60_000) throw new HttpError(429,'Wait 60 seconds before requesting a new code.','VERIFICATION_COOLDOWN');
          await deliverVerification(user);
          return json(200,{ok:true,message:'Verification email sent.'});
        }
        if (path === '/api/auth/verify' && method === 'POST') {
          if (!verificationEnabled) throw new HttpError(409,'Email verification is not configured.','VERIFICATION_DISABLED');
          limit(request,'email-verify',15,60_000,`user:${user.id}`);
          const {code}=await readJson(request);
          const pending=db.prepare('SELECT * FROM email_verifications WHERE userId=?').get(user.id);
          if (!pending || pending.expiresAt <= Date.now() || pending.attempts >= 5) throw new HttpError(400,'Code expired or unavailable. Request a new code.','INVALID_VERIFICATION_CODE');
          db.prepare('UPDATE email_verifications SET attempts=attempts+1 WHERE userId=?').run(user.id);
          if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(hash(`${user.id}:${code}`),'hex'),Buffer.from(pending.codeHash,'hex'))) throw new HttpError(400,'Invalid verification code.','INVALID_VERIFICATION_CODE');
          transaction(() => {db.prepare('UPDATE users SET emailVerified=1 WHERE id=?').run(user.id);db.prepare('DELETE FROM email_verifications WHERE userId=?').run(user.id);plans.audit('email_verified',user);});
          return json(200,{...accountState(user.id),ok:true});
        }
        if (method === 'GET' && path === '/api/credits/ledger') return json(200, { entries: db.prepare('SELECT id,type,credits,balance,createdAt,note FROM ledger WHERE userId=? ORDER BY createdAt DESC LIMIT 200').all(user.id) });
        if (method === 'POST' && path === '/api/credits/redeem') {
          limit(request, 'redeem', 20, 60_000, `user:${user.id}`);
          const body = await readJson(request);
          const rawCode=typeof body.code==='string'?body.code.trim():'';
          const code=rawCode.startsWith('STXO1.')?rawCode:rawCode.toUpperCase();
          let offline;
          if(code.startsWith('STXO1.')){try{if(!offlinePublicKey)throw Error();offline=verifyOfflineCode(code,offlinePublicKey);}catch{throw new HttpError(400,'Offline-Code ist ungültig, verändert oder stammt von einem anderen Herausgeber.','INVALID_CODE');}}
          else if(!/^STX-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/.test(code))throw new HttpError(400,'Invalid redemption code.','INVALID_CODE');
          const redeemed=transaction(() => {
            if(offline){const existing=db.prepare('SELECT id FROM credit_keys WHERE codeHash=?').get(hash(code));if(!existing)db.prepare('INSERT INTO credit_keys(id,codeHash,credits,note,createdAt,type,planId,durationDays) VALUES(?,?,?,?,?,?,?,?)').run(offline.id,hash(code),offline.type==='plan'?1:offline.credits,'Offline-signierter Code',new Date(offline.issuedAt).toISOString(),offline.type,offline.planId,offline.durationDays);}
            const key=db.prepare('SELECT * FROM credit_keys WHERE codeHash=?').get(hash(code));
            if (!key || key.redeemedAt) throw new HttpError(400,'This code is invalid or has already been redeemed.','INVALID_CODE');
            const current=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
            const plan=key.type === 'plan' ? plans.catalog.plans.find(item => item.id === key.planId && item.id !== 'free') : null;
            if (key.type === 'plan' && !plan) throw new HttpError(409,'The plan for this code is no longer available.','PLAN_UNAVAILABLE');
            if (key.type !== 'plan' && !integer(current.balance+key.credits,0,Number.MAX_SAFE_INTEGER)) throw new HttpError(409,'Balance limit exceeded.');
            const result=db.prepare('UPDATE credit_keys SET redeemedAt=?,redeemedBy=? WHERE id=? AND redeemedAt IS NULL').run(iso(),user.id,key.id);
            if (result.changes !== 1) throw new HttpError(409,'Code has already been redeemed.','INVALID_CODE');
            if (plan) {
              const start=current.planId === plan.id && current.planExpiresAt > Date.now() ? current.planExpiresAt : Date.now();
              const expiresAt=start+key.durationDays*86_400_000;
              db.prepare('UPDATE users SET planId=?,planExpiresAt=? WHERE id=?').run(plan.id,expiresAt,user.id);
              plans.audit('plan_activated',user,{keyId:key.id,planId:plan.id,durationDays:key.durationDays,expiresAt:new Date(expiresAt).toISOString()});
              return {type:'plan',credits:0,planName:plan.name};
            }
            const balance=current.balance+key.credits;
            db.prepare('UPDATE users SET balance=? WHERE id=?').run(balance,user.id);
            recordLedger(user.id,'redeem',key.credits,balance,key.id);
            plans.audit('credits_redeemed',user,{keyId:key.id,credits:key.credits});
            return {type:'credits',credits:key.credits};
          });
          const message=redeemed.type === 'plan' ? (body.language === 'en' ? `${redeemed.planName} activated.` : `${redeemed.planName} wurde aktiviert.`) : body.language === 'en' ? `Congratulations! You have received ${redeemed.credits.toLocaleString('en-US')} credits.` : `Herzlichen Glückwunsch! Du hast ${redeemed.credits.toLocaleString('de-DE')} Credits erhalten.`;
          return json(200,{...accountState(user.id),...redeemed,message});
        }
        if (path === '/api/conversations' && method === 'GET') return json(200, { conversations: db.prepare('SELECT id,title,createdAt,updatedAt FROM conversations WHERE userId=? ORDER BY updatedAt DESC LIMIT 100').all(user.id) });
        if (path === '/api/conversations' && method === 'POST') {
          const { title } = await readJson(request); const time = iso();
          const conversation = { id: randomUUID(), title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : 'New conversation', createdAt: time, updatedAt: time };
          db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(conversation.id, user.id, conversation.title, time, time);
          return json(201, { conversation });
        }
        const metricMatch=path.match(/^\/api\/messages\/([a-f0-9-]{36})\/elapsed$/);
        if(metricMatch&&method==='POST'){const {elapsedMs}=await readJson(request);if(!integer(elapsedMs,0,7200000))throw new HttpError(400,'Invalid elapsed duration.');const owned=db.prepare("SELECT m.id FROM messages m JOIN conversations c ON m.conversationId=c.id WHERE m.id=? AND c.userId=? AND m.role='assistant'").get(metricMatch[1],user.id);if(!owned)throw new HttpError(404,'Not found.','NOT_FOUND');db.prepare('INSERT INTO message_metrics VALUES(?,?) ON CONFLICT(messageId) DO UPDATE SET elapsedMs=MAX(elapsedMs,excluded.elapsedMs)').run(owned.id,elapsedMs);return json(200,{ok:true});}
        const conversationMatch = path.match(/^\/api\/conversations\/([a-f0-9-]{36})$/);
        if (conversationMatch && ['GET', 'DELETE'].includes(method)) {
          const conversation = db.prepare('SELECT id,title,createdAt,updatedAt FROM conversations WHERE id=? AND userId=?').get(conversationMatch[1], user.id);
          if (!conversation) throw new HttpError(404, 'Conversation not found.', 'NOT_FOUND');
          if (method === 'GET') return json(200, { conversation, promptSettings:prompts.readConversation(user.id,conversation.id), messages: db.prepare('SELECT id,role,content,createdAt,model FROM messages WHERE conversationId=? ORDER BY rowid').all(conversation.id).map(item=>({...item,elapsedMs:db.prepare('SELECT elapsedMs FROM message_metrics WHERE messageId=?').get(item.id)?.elapsedMs,attachments:attachments.list(item.id)})) });
          if (busyUsers.has(user.id)) throw new HttpError(409, 'A response is still generating.', 'CHAT_BUSY');
          db.prepare('DELETE FROM conversations WHERE id=?').run(conversation.id); return json(200, { ok: true });
        }
        if (path === '/api/chat' && method === 'POST') {
          const body = await readJson(request,15*1024*1024);
          const uploaded=validateAttachments(body.attachments);
          const { message, conversationId, language = 'de' } = body;
          const model = models.find(item => item.id === (body.model || models[0].id));
          if(typeof message==='string' && message.length>16000) throw new HttpError(413,'Message exceeds 16,000 characters.','BODY_TOO_LARGE');
          if (typeof message !== 'string' || (!message.trim() && !uploaded.length) || !['de', 'en'].includes(language) || !model) throw new HttpError(400, 'A message of 1–16,000 characters and a valid model are required.', 'INVALID_MESSAGE');
          if (body.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.requestId))) throw new HttpError(400, 'requestId must be a UUID.', 'INVALID_REQUEST_ID');
          const requestId = body.requestId?.toLowerCase();
          let requestedPrompts;
          if (body.promptSettings !== undefined) {
            if (!body.promptSettings || typeof body.promptSettings !== 'object' || Array.isArray(body.promptSettings) || typeof body.promptSettings.override !== 'boolean' || (body.promptSettings.override && !validPromptSettings(body.promptSettings,true))) throw new HttpError(400,'Use valid promptSettings with an explicit override flag.','INVALID_PROMPT_SETTINGS');
            requestedPrompts=body.promptSettings.override ? {override:true,instructions:body.promptSettings.instructions,additionalPrompt:body.promptSettings.additionalPrompt} : {override:false};
          }
          // Hash explicit request data; saved account/admin edits must not change
          // the identity of a completed retry. The effective prompt gets its own
          // immutable hash below, representing exactly what reached the provider.
          const inputHash = hash(JSON.stringify({ message: message.trim(), model: model.id, conversationId: conversationId || null, language,...(uploaded.length?{attachments:uploaded.map(({name,mime,hash})=>({name,mime,hash}))}:{}),...(requestedPrompts ? {promptSettings:requestedPrompts} : {}) }));
          if (requestId) {
            const cached = db.prepare('SELECT inputHash,response FROM chat_requests WHERE userId=? AND requestId=?').get(user.id, requestId);
            if (cached) {
              if (cached.inputHash !== inputHash) throw new HttpError(409, 'This request ID was already used with a different message.', 'REQUEST_ID_REUSED');
              return json(200, JSON.parse(cached.response));
            }
          }
          if (verificationEnabled && !user.emailVerified) throw new HttpError(403,'Verify your email before using chat.','EMAIL_VERIFICATION_REQUIRED');
          const plan=plans.effectivePlan(user);
          if ((model.tier ?? 0) > plan.modelTier) throw new HttpError(403,'This model requires a higher plan.','MODEL_NOT_ALLOWED');
          limit(request, 'chat', 30+plan.priority*10, 60_000, `user:${user.id}`);
          if (busyUsers.has(user.id)) throw new HttpError(409, 'A response is still generating.', 'CHAT_BUSY');
          let conversation;
          if (conversationId) {
            conversation = db.prepare('SELECT * FROM conversations WHERE id=? AND userId=?').get(conversationId, user.id);
            if (!conversation) throw new HttpError(404, 'Conversation not found.', 'NOT_FOUND');
          }
          const history = conversation ? db.prepare('SELECT id,role,content FROM messages WHERE conversationId=? ORDER BY rowid DESC LIMIT 24').all(conversation.id).reverse() : [];
          while (history.length && history.reduce((n, item) => n + item.content.length, 0) > (options.aiTransport==='ollama-native' ? (plan.id==='free'?12000:24000) : 48000)) history.splice(0, 2);
          const promptSettings=requestedPrompts?.override ? requestedPrompts : requestedPrompts ? {...prompts.readPreferences(user.id),override:false} : prompts.readConversation(user.id,conversation?.id);
          const systemMessage=prompts.buildMessages(promptSettings,language);
          if(/\.(?:py|exe|js|html|css|json|txt|cpp|ps1)\b|(?:erstelle|schreib|programmiere|entwickle|create|build).{0,80}(?:datei|file|programm|app|tool)/i.test(message))systemMessage.content+='\nWhen creating files, return complete code in fenced blocks using a language and filename, for example ```python filename="main.py". For project edits, preserve relative file paths from the supplied source snapshot in filename attributes. Return the complete updated contents of changed files. Never use absolute paths or parent traversal. For a requested Windows EXE provide complete Python source; the desktop builds it with PyInstaller. Never present text renamed to .exe. Prefer Python standard library when possible. Do not claim saving or building succeeded; the app reports actual results.';
          const promptHash=hash(systemMessage.content);
          const historyItems=attachments.historyMessages(history,uploaded);
          const allContextAttachments=[...uploaded,...historyItems.flatMap(item=>item.attachments)];
          if(allContextAttachments.some(item=>item.kind==='image') && !model.vision) throw new HttpError(422,'The selected model does not support image attachments. Choose an image-capable model.','IMAGE_NOT_SUPPORTED');
          const currentMessage={role:'user',content:providerContent(message.trim(),uploaded)};
          const requestMessages = [systemMessage, ...historyItems.map(item=>item.message), currentMessage];
          const maxOutputTokens = Math.min(options.maxOutputTokens ?? plan.maxOutputTokens,plan.maxOutputTokens,model.maxOutputTokens ?? 32768);
          const estimatedInput = 64+estimatedMessageTokens(systemMessage)+historyItems.reduce((sum,item)=>sum+estimatedMessageTokens(item.message,item.attachments),0)+estimatedMessageTokens(currentMessage,uploaded);
          const maxInputTokens = options.aiTransport==='ollama-native' ? Math.max(estimatedInput,512+requestMessages.reduce((sum,item)=>sum+Buffer.byteLength(typeof item.content==='string'?item.content:JSON.stringify(item.content)),0)) : estimatedInput;
          const reviewSettings=integrations.reviewer(user.id);
          const reviewModel=reviewSettings.enabled?models.find(m=>m.id===reviewSettings.model):null;
          if(reviewSettings.enabled && (!reviewModel||reviewModel.available===false||(reviewModel.tier??0)>plan.modelTier||options.aiTransport!=='ollama-native'))throw new HttpError(409,'Pruefermodell nicht verfuegbar. In Integrationen anpassen.','REVIEWER_UNAVAILABLE');
          const multiplier=Math.max(model.multiplier??1,reviewModel?.multiplier??1);
          const reservation = demoMode ? 0 : Math.ceil((maxInputTokens + maxOutputTokens + (reviewModel?maxInputTokens+maxOutputTokens*4+1024:0))*multiplier / TOKENS_PER_CREDIT);
          let heldCredits=0;let heldQuota=0;
          if (!demoMode && !baseUrl) throw new HttpError(503, 'AI provider is not configured.', 'PROVIDER_UNAVAILABLE');
          const generationStartedAt=Date.now();
          busyUsers.add(user.id);
          setProgress(user.id,requestId,{stage:'queued',startedAt:Date.now(),preview:''});
          const reservationId = randomUUID();
          let reserved = false; let releaseProvider;
          try {
            if (reservation) {
              transaction(() => {
                const window=quotaWindow(db,user.id,plan);
                heldQuota=quotasEnabled ? Math.min(reservation,Math.max(0,plan.shortLimit-window.shortUsed),Math.max(0,plan.weekLimit-window.weekUsed)) : 0;
                heldCredits=reservation-heldQuota;
                const result=db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').run(heldCredits,user.id,heldCredits);
                if (result.changes !== 1) throw new HttpError(402,quotasEnabled ? 'The remaining allowance and credits cannot cover this request. Wait for renewal, use a shorter context, or redeem a code.' : `This request requires a temporary reservation of ${reservation} credits. Unused credits are returned.`,quotasEnabled ? 'QUOTA_EXHAUSTED' : 'INSUFFICIENT_CREDITS');
                if (heldQuota) db.prepare('UPDATE quota_windows SET shortUsed=shortUsed+?,weekUsed=weekUsed+? WHERE userId=?').run(heldQuota,heldQuota,user.id);
                db.prepare('INSERT INTO reservations(id,userId,credits,createdAt,quotaUnits,shortReset,weekReset) VALUES(?,?,?,?,?,?,?)').run(reservationId,user.id,heldCredits,iso(),heldQuota,window.shortReset,window.weekReset);
              }); reserved=true;
            }
            let content; let inputTokens = 0; let outputTokens = 0; let charge = 0;
            if (demoMode) {
              content = language === 'de' ? 'Dies ist der Stelex-GPT-Demomodus. Deine Nachricht wurde gespeichert; es wurde kein KI-Modell aufgerufen und es werden keine Credits abgezogen.\n\nFür echte Antworten starte Ollama mit einem installierten Modell oder verbinde einen konfigurierten Stelex-Server. Danach kannst du hier programmieren, Texte schreiben und Ideen ausarbeiten.' : 'This is the Stelex GPT demo mode. Your message has been saved; no AI model was called and no credits are charged.\n\nFor real responses, start Ollama with an installed model or connect a configured Stelex server. Then use this chat for coding, writing, and creative work.';
            } else {
              let result;
              try { releaseProvider=await providerScheduler.acquire(plan.priority,AbortSignal.timeout(options.providerQueueTimeoutMs ?? 120_000)); }
              catch (error) { throw new HttpError(503,error.code === 'PROVIDER_QUEUE_FULL' ? error.message : 'The AI queue wait timed out. Please retry shortly.',error.code === 'PROVIDER_QUEUE_FULL' ? error.code : 'PROVIDER_QUEUE_TIMEOUT'); }
              setProgress(user.id,requestId,{stage:'loading'});
              if(options.aiTransport==='ollama-native'){
                try {
                  const wantedModel=model.upstreamModel||model.id;
                  if(lastLocalModel && lastLocalModel!==wantedModel){try{const unload=await fetchProvider(`${new URL(baseUrl).origin}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:lastLocalModel,keep_alive:0}),signal:AbortSignal.timeout(10000)});await unload.body?.cancel();}catch{}}
                  lastLocalModel=wantedModel;
                  const answer=await ollamaChat({baseUrl,fetchImpl:fetchProvider,model:wantedModel,messages:requestMessages,maxOutputTokens,supportsThinking:model.supportsThinking??/qwen3\.5|gemma4/.test(wantedModel),contextWindow:model.contextWindow||4096,temperature:model.temperature??0.8,topP:model.topP??0.9,topK:model.topK??40,repeatPenalty:model.repeatPenalty??1.1,signal:AbortSignal.any([providerShutdown.signal,AbortSignal.timeout(options.providerTimeoutMs??600000)]),onProgress:update=>setProgress(user.id,requestId,update)});
                  content=answer.content;inputTokens=answer.inputTokens;outputTokens=answer.outputTokens;
                  // Reserve a conservative upper bound separately from tokenizer estimates.
                  if(inputTokens>maxInputTokens || outputTokens>maxOutputTokens)throw Object.assign(new Error('Model usage exceeds the reserved context.'),{code:'INVALID_PROVIDER_RESPONSE'});
                }catch(error){throw new HttpError(error.code==='PROVIDER_UNAVAILABLE'?503:502,error.message,error.code||'PROVIDER_ERROR');}
              }else{
              try {
                result = await fetchProvider(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.aiApiKey ? { Authorization: `Bearer ${options.aiApiKey}` } : {}) }, body: JSON.stringify({ model: model.upstreamModel || model.id, messages: requestMessages, max_tokens: maxOutputTokens, stream: false, ...(model.reasoningSupported ? {reasoning_effort:plan.reasoningEffort} : {}) }), signal: AbortSignal.any([providerShutdown.signal,AbortSignal.timeout(options.providerTimeoutMs ?? 600_000)]) });
              } catch { providerObservation = { reachable: false, checkedAt: iso() }; throw new HttpError(503, 'The AI provider could not be reached. Credits were returned.', 'PROVIDER_UNAVAILABLE'); }
              if (!result.ok) { await result.body?.cancel(); throw new HttpError(502, `The AI provider returned HTTP ${result.status}. Credits were returned.`, 'PROVIDER_ERROR'); }
              let payload;
              try { payload = await result.json(); }
              catch { throw new HttpError(502, 'The AI provider returned invalid JSON. Credits were returned.', 'INVALID_PROVIDER_RESPONSE'); }
              content = payload.choices?.[0]?.message?.content;
              inputTokens = payload.usage?.prompt_tokens; outputTokens = payload.usage?.completion_tokens;
              if (typeof content !== 'string' || !content.trim() || content.length > 1_000_000 || !integer(inputTokens, 0, maxInputTokens) || !integer(outputTokens, 0, maxOutputTokens)) throw new HttpError(502, 'The AI provider returned an invalid response or missing usage. Credits were returned.', 'INVALID_PROVIDER_RESPONSE');
              }
              let weightedTokens=(inputTokens+outputTokens)*(model.multiplier??1);
              if(reviewModel){
                const reviewerName=reviewModel.upstreamModel||reviewModel.id;
                if(lastLocalModel!==reviewerName){try{const unload=await fetchProvider(`${new URL(baseUrl).origin}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:lastLocalModel,keep_alive:0}),signal:AbortSignal.timeout(10000)});await unload.body?.cancel();}catch{}}
                lastLocalModel=reviewerName;
                try{const reviewed=await reviewAnswer({draft:content,messages:requestMessages,model:reviewModel,baseUrl,fetchImpl:fetchProvider,signal:AbortSignal.any([providerShutdown.signal,AbortSignal.timeout(options.providerTimeoutMs??600000)]),onProgress:update=>setProgress(user.id,requestId,update),ollamaChat,maxOutputTokens:Math.min(maxOutputTokens,1024)});content=reviewed.content;weightedTokens+=(reviewed.inputTokens+reviewed.outputTokens)*(reviewModel.multiplier??1);inputTokens+=reviewed.inputTokens;outputTokens+=reviewed.outputTokens;}catch(error){throw new HttpError(502,'Pruefung fehlgeschlagen: '+error.message,'REVIEWER_FAILED');}
              }
              charge = Math.ceil(weightedTokens / TOKENS_PER_CREDIT);
              if(charge>reservation)throw new HttpError(502,'Model usage exceeds the reserved bound.','INVALID_PROVIDER_RESPONSE');
              providerObservation = { reachable: true, checkedAt: iso() };
            }
            const time = iso();
            const assistant = { id: randomUUID(), role: 'assistant', content, createdAt: time, model: model.id,elapsedMs:Math.max(0,Date.now()-generationStartedAt) };
            const completed = transaction(() => {
              if (!conversation) {
                conversation = { id: randomUUID(), title: (message.trim().replace(/\s+/g, ' ')||uploaded[0]?.name||'New conversation').slice(0, 70) };
                db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(conversation.id, user.id, conversation.title, time, time);
              }
              if (requestedPrompts) prompts.saveConversation(conversation.id,requestedPrompts);
              const userMessageId=randomUUID();
              db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(userMessageId, conversation.id, 'user', message.trim(), time, model.id);
              const userMessage={id:userMessageId,role:'user',content:message.trim(),createdAt:time,model:model.id,attachments:attachments.save(userMessageId,uploaded)};
              db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(assistant.id, conversation.id, 'assistant', content, time, model.id);
              db.prepare('INSERT INTO message_metrics VALUES(?,?)').run(assistant.id,assistant.elapsedMs);
              db.prepare('UPDATE conversations SET updatedAt=? WHERE id=?').run(time, conversation.id);
              const includedUnits=Math.min(charge,heldQuota);
              const creditsCharged=charge-includedUnits;
              if (reserved) {
                const held=db.prepare('SELECT * FROM reservations WHERE id=?').get(reservationId);
                restoreQuota(db,held,heldQuota-includedUnits);
                db.prepare('DELETE FROM reservations WHERE id=?').run(reservationId);
              }
              db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(heldCredits-creditsCharged,user.id);
              const next = db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance;
              db.prepare('INSERT INTO usage(id,userId,model,inputTokens,outputTokens,credits,demo,createdAt,includedUnits,weightedUnits) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),user.id,model.id,inputTokens,outputTokens,creditsCharged,demoMode ? 1 : 0,time,includedUnits,charge);
              if (creditsCharged) recordLedger(user.id,'usage',-creditsCharged,next,model.id);
              const result = {...accountState(user.id),conversationId:conversation.id,message:assistant,userMessage,creditsCharged,includedUnits,unitsUsed:charge,promptSettings:prompts.readConversation(user.id,conversation.id)};
              if (requestId) db.prepare('INSERT INTO chat_requests(userId,requestId,inputHash,conversationId,response,createdAt,promptHash) VALUES(?,?,?,?,?,?,?)').run(user.id, requestId, inputHash, conversation.id, JSON.stringify(result), time,promptHash);
              return result;
            });
            reserved = false;
            setProgress(user.id,requestId,{stage:'done',preview:''});
            return json(200, completed);
          } finally {
            setProgress(user.id,requestId,{stage:'finished',preview:''});
            releaseProvider?.();
            if (reserved) transaction(() => {
              const held=db.prepare('SELECT * FROM reservations WHERE id=?').get(reservationId);
              db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(held.credits,user.id);
              restoreQuota(db,held,held.quotaUnits);
              db.prepare('DELETE FROM reservations WHERE id=?').run(reservationId);
            });
            busyUsers.delete(user.id);
          }
        }
        throw new HttpError(404, 'Endpoint not found.', 'NOT_FOUND');
      }
      if (['GET', 'HEAD'].includes(method)) {
        const isAdmin = path === '/admin' || path.startsWith('/admin/');
        if (isAdmin && options.adminEnabled === false) throw new HttpError(404, 'Not found.', 'NOT_FOUND');
        const staticRoot = resolve(options.staticDir || resolve(ROOT, 'dist'));
        const root = isAdmin ? resolve(options.adminDir || resolve(ROOT, 'admin')) : staticRoot;
        let relative;
        try { relative = decodeURIComponent(isAdmin ? path.replace(/^\/admin\/?/, '') : path.replace(/^\//, '')); }
        catch { throw new HttpError(400, 'Invalid path.'); }
        const candidate = resolve(root, relative || 'index.html');
        if ((candidate === root || candidate.startsWith(`${root}${sep}`)) && serveFile(response, candidate, method === 'HEAD')) return;
        if (!extname(relative) && serveFile(response, resolve(root, 'index.html'), method === 'HEAD')) return;
      }
      throw new HttpError(404, 'Not found.', 'NOT_FOUND');
    } catch (error) {
      if (!response.headersSent) json(error.status || 500, { error: error.status ? error.message : 'An internal error occurred.', code: error.code || 'INTERNAL_ERROR' });
      else response.end();
    }
  });
  server.requestTimeout = 150_000; server.headersTimeout = 10_000;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return; disposed = true;
    try { mailTransport?.close(); await dispatcher?.close(); }
    finally { try { db.close(); } finally { releaseLock(); } }
  };
  return {
    server, db,
    listen(port = 4318, host = '127.0.0.1') { return new Promise((resolveListen, reject) => {
      const onError = async error => { try { await dispose(); } finally { reject(error); } };
      server.once('error', onError);
      try { server.listen(port, host, () => { server.off('error', onError); resolveListen(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${server.address().port}`); }); }
      catch (error) { server.off('error', onError); void onError(error); }
    }); },
    async close() { if (disposed) return;providerScheduler.close();providerShutdown.abort(new Error('Server shutting down.'));await new Promise(resolveClose => server.close(resolveClose));await dispose(); },
  };
  } catch (error) {
    try { await dispatcher?.close(); }
    finally { try { db?.close(); } finally { releaseLock(); } }
    throw error;
  }
}
