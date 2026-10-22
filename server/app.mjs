import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PER_CREDIT = 100;
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = () => new Date().toISOString();
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const publicModel = ({ id, name, description }) => ({ id, name, description });
const publicUser = user => ({ id: user.id, email: user.email, name: user.name });

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

async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.', 'CONTENT_TYPE');
  }
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 96 * 1024) throw new HttpError(413, 'Request is too large.', 'BODY_TOO_LARGE');
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
  // Run one backend process per database. Recover interrupted requests on restart.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of db.prepare('SELECT userId, SUM(credits) credits FROM reservations GROUP BY userId').all()) db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(item.credits, item.userId);
    db.exec('DELETE FROM reservations; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const demoMode = options.demoMode ?? !options.aiBaseUrl;
  const initialCredits = options.initialCredits ?? (demoMode ? 500 : 0);
  if (!integer(initialCredits, 0, 1_000_000_000)) throw new Error('Invalid initialCredits');
  const baseUrl = options.aiBaseUrl?.replace(/\/+$/, '');
  const models = options.models?.length ? options.models : demoMode
    ? [{ id: 'stelex-fast', name: 'Stelex Fast', description: 'Demo' }, { id: 'stelex-pro', name: 'Stelex Pro', description: 'Demo' }]
    : [{ id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder · 1.5B' }];
  if (models.some(m => typeof m.id !== 'string' || !m.id || typeof m.name !== 'string')) throw new Error('Invalid models');
  const adminHash = options.adminToken ? Buffer.from(hash(options.adminToken), 'hex') : null;
  const rateLimits = new Map(); const busyUsers = new Set();
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
  const currentUser = request => {
    const token = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('stelex_session='))?.slice(15);
    if (!token) throw new HttpError(401, 'Please sign in.', 'AUTH_REQUIRED');
    const user = db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?').get(hash(token), Date.now());
    if (!user) throw new HttpError(401, 'Session expired. Please sign in.', 'AUTH_REQUIRED');
    return user;
  };
  const requireAdmin = request => {
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
    if (!adminHash || !timingSafeEqual(Buffer.from(hash(token), 'hex'), adminHash)) throw new HttpError(401, 'Invalid administrator token.', 'ADMIN_REQUIRED');
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
  const sessionCookie = (request, token, expired = false) => `stelex_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired ? 0 : SESSION_AGE / 1000}${options.secureCookies || options.publicUrl?.startsWith('https:') || request.socket.encrypted ? '; Secure' : ''}`;
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
      if (method === 'GET' && path === '/api/health') {
        await checkProvider();
        return json(200, { ok: true, demoMode, models: models.map(publicModel), tokensPerCredit: TOKENS_PER_CREDIT, provider: { kind: providerKind, configured: !demoMode, ...providerObservation } });
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
            db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, email, name, passwordHash(password), initialCredits, iso());
            if (initialCredits) recordLedger(id, 'welcome', initialCredits, initialCredits, demoMode ? 'Demo starting balance' : 'Starting balance');
          });
          user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
        } else {
          user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
          if (!user || !verifyPassword(password, user.password)) throw new HttpError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
        }
        const token = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + SESSION_AGE);
        return json(200, { user: publicUser(user), balance: user.balance, usage: getUsage(user.id), demoMode }, { 'Set-Cookie': sessionCookie(request, token) });
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        const token = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('stelex_session='))?.slice(15);
        if (token) db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hash(token));
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '', true) });
      }
      if (path.startsWith('/api/admin/')) {
        limit(request, 'admin', 100); requireAdmin(request);
        if (method === 'POST' && path === '/api/admin/keys') {
          const { credits, count = 1, note = '' } = await readJson(request);
          if (!integer(credits, 1, 1_000_000_000) || !integer(count, 1, 100) || typeof note !== 'string' || note.length > 200) throw new HttpError(400, 'Use 1–1,000,000,000 credits and 1–100 keys.', 'INVALID_KEY_AMOUNT');
          const keys = transaction(() => Array.from({ length: count }, () => {
            const code = `STX-${randomBytes(20).toString('hex').toUpperCase().match(/.{1,8}/g).join('-')}`;
            const key = { id: randomUUID(), code, credits, createdAt: iso(), note };
            db.prepare('INSERT INTO credit_keys(id,codeHash,credits,note,createdAt) VALUES(?,?,?,?,?)').run(key.id, hash(code), credits, note, key.createdAt);
            return key;
          }));
          return json(201, { keys });
        }
        if (method === 'GET' && path === '/api/admin/keys') return json(200, { keys: db.prepare("SELECT id,credits,note,createdAt,redeemedAt,redeemedBy, CASE WHEN redeemedAt IS NULL THEN 'available' ELSE 'redeemed' END status FROM credit_keys ORDER BY createdAt DESC LIMIT 500").all() });
        if (method === 'GET' && path === '/api/admin/stats') {
          const keys = db.prepare('SELECT COUNT(*) keys, COALESCE(SUM(CASE WHEN redeemedAt IS NULL THEN 1 ELSE 0 END),0) unredeemedKeys, COALESCE(SUM(credits),0) creditsIssued, COALESCE(SUM(CASE WHEN redeemedAt IS NOT NULL THEN credits ELSE 0 END),0) creditsRedeemed FROM credit_keys').get();
          const usage = db.prepare('SELECT COALESCE(SUM(credits),0) creditsConsumed, COUNT(*) responses FROM usage').get();
          return json(200, { users: db.prepare('SELECT COUNT(*) total FROM users').get().total, ...keys, ...usage });
        }
        throw new HttpError(404, 'Endpoint not found.', 'NOT_FOUND');
      }
      if (path.startsWith('/api/')) {
        const user = currentUser(request);
        if (method === 'GET' && path === '/api/me') return json(200, { user: publicUser(user), balance: user.balance, usage: getUsage(user.id), demoMode });
        if (method === 'GET' && path === '/api/credits/ledger') return json(200, { entries: db.prepare('SELECT id,type,credits,balance,createdAt,note FROM ledger WHERE userId=? ORDER BY createdAt DESC LIMIT 200').all(user.id) });
        if (method === 'POST' && path === '/api/credits/redeem') {
          limit(request, 'redeem', 20, 60_000, `user:${user.id}`);
          const body = await readJson(request);
          const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
          if (!/^STX-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/.test(code)) throw new HttpError(400, 'Invalid redemption code.', 'INVALID_CODE');
          const redeemed = transaction(() => {
            const key = db.prepare('SELECT * FROM credit_keys WHERE codeHash=?').get(hash(code));
            if (!key || key.redeemedAt) throw new HttpError(400, 'This code is invalid or has already been redeemed.', 'INVALID_CODE');
            const current = db.prepare('SELECT balance FROM users WHERE id=?').get(user.id);
            if (!integer(current.balance + key.credits, 0, Number.MAX_SAFE_INTEGER)) throw new HttpError(409, 'Balance limit exceeded.');
            const result = db.prepare('UPDATE credit_keys SET redeemedAt=?,redeemedBy=? WHERE id=? AND redeemedAt IS NULL').run(iso(), user.id, key.id);
            if (result.changes !== 1) throw new HttpError(409, 'Code has already been redeemed.', 'INVALID_CODE');
            const balance = current.balance + key.credits;
            db.prepare('UPDATE users SET balance=? WHERE id=?').run(balance, user.id);
            recordLedger(user.id, 'redeem', key.credits, balance, key.id);
            return { credits: key.credits, balance };
          });
          return json(200, { ...redeemed, message: body.language === 'en' ? `Congratulations! You have received ${redeemed.credits.toLocaleString('en-US')} credits.` : `Herzlichen Glückwunsch! Du hast ${redeemed.credits.toLocaleString('de-DE')} Credits erworben.` });
        }
        if (path === '/api/conversations' && method === 'GET') return json(200, { conversations: db.prepare('SELECT id,title,createdAt,updatedAt FROM conversations WHERE userId=? ORDER BY updatedAt DESC LIMIT 100').all(user.id) });
        if (path === '/api/conversations' && method === 'POST') {
          const { title } = await readJson(request); const time = iso();
          const conversation = { id: randomUUID(), title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : 'New conversation', createdAt: time, updatedAt: time };
          db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(conversation.id, user.id, conversation.title, time, time);
          return json(201, { conversation });
        }
        const conversationMatch = path.match(/^\/api\/conversations\/([a-f0-9-]{36})$/);
        if (conversationMatch && ['GET', 'DELETE'].includes(method)) {
          const conversation = db.prepare('SELECT id,title,createdAt,updatedAt FROM conversations WHERE id=? AND userId=?').get(conversationMatch[1], user.id);
          if (!conversation) throw new HttpError(404, 'Conversation not found.', 'NOT_FOUND');
          if (method === 'GET') return json(200, { conversation, messages: db.prepare('SELECT id,role,content,createdAt,model FROM messages WHERE conversationId=? ORDER BY rowid').all(conversation.id) });
          if (busyUsers.has(user.id)) throw new HttpError(409, 'A response is still generating.', 'CHAT_BUSY');
          db.prepare('DELETE FROM conversations WHERE id=?').run(conversation.id); return json(200, { ok: true });
        }
        if (path === '/api/chat' && method === 'POST') {
          const body = await readJson(request);
          const { message, conversationId, language = 'de' } = body;
          const model = models.find(item => item.id === (body.model || models[0].id));
          if (typeof message !== 'string' || !message.trim() || message.length > 16000 || !['de', 'en'].includes(language) || !model) throw new HttpError(400, 'A message of 1–16,000 characters and a valid model are required.', 'INVALID_MESSAGE');
          if (body.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.requestId))) throw new HttpError(400, 'requestId must be a UUID.', 'INVALID_REQUEST_ID');
          const requestId = body.requestId?.toLowerCase();
          const inputHash = hash(JSON.stringify({ message: message.trim(), model: model.id, conversationId: conversationId || null, language }));
          if (requestId) {
            const cached = db.prepare('SELECT inputHash,response FROM chat_requests WHERE userId=? AND requestId=?').get(user.id, requestId);
            if (cached) {
              if (cached.inputHash !== inputHash) throw new HttpError(409, 'This request ID was already used with a different message.', 'REQUEST_ID_REUSED');
              return json(200, JSON.parse(cached.response));
            }
          }
          limit(request, 'chat', 30, 60_000, `user:${user.id}`);
          if (busyUsers.has(user.id)) throw new HttpError(409, 'A response is still generating.', 'CHAT_BUSY');
          let conversation;
          if (conversationId) {
            conversation = db.prepare('SELECT * FROM conversations WHERE id=? AND userId=?').get(conversationId, user.id);
            if (!conversation) throw new HttpError(404, 'Conversation not found.', 'NOT_FOUND');
          }
          const history = conversation ? db.prepare('SELECT role,content FROM messages WHERE conversationId=? ORDER BY rowid DESC LIMIT 24').all(conversation.id).reverse() : [];
          while (history.length && history.reduce((n, item) => n + item.content.length, 0) > 48000) history.splice(0, 2);
          const systemPrompt = `You are Stelex GPT, a direct, thoughtful coding and creative assistant. Give practical, complete answers. Be accurate about limitations. Respect your model provider's safety requirements. Never claim to bypass safeguards or reveal hidden chain-of-thought. Reply in ${language === 'de' ? 'German' : 'English'}.`;
          const requestMessages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message.trim() }];
          const maxOutputTokens = options.maxOutputTokens ?? 2048;
          const maxInputTokens = requestMessages.reduce((n, item) => n + Buffer.byteLength(item.content, 'utf8') + 32, 64);
          const reservation = demoMode ? 0 : Math.ceil((maxInputTokens + maxOutputTokens) / TOKENS_PER_CREDIT);
          if (!demoMode && !baseUrl) throw new HttpError(503, 'AI provider is not configured.', 'PROVIDER_UNAVAILABLE');
          busyUsers.add(user.id);
          const reservationId = randomUUID();
          let reserved = false;
          try {
            if (reservation) {
              transaction(() => {
                const result = db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').run(reservation, user.id, reservation);
                if (result.changes !== 1) throw new HttpError(402, `This request requires a temporary reservation of ${reservation} credits. Unused credits are returned.`, 'INSUFFICIENT_CREDITS');
                db.prepare('INSERT INTO reservations VALUES(?,?,?,?)').run(reservationId, user.id, reservation, iso());
              }); reserved = true;
            }
            let content; let inputTokens = 0; let outputTokens = 0; let charge = 0;
            if (demoMode) {
              content = language === 'de' ? 'Dies ist der Stelex-GPT-Demomodus. Deine Nachricht wurde gespeichert; es wurde kein KI-Modell aufgerufen und es werden keine Credits abgezogen.\n\nFür echte Antworten starte Ollama mit einem installierten Modell oder verbinde einen konfigurierten Stelex-Server. Danach kannst du hier programmieren, Texte schreiben und Ideen ausarbeiten.' : 'This is the Stelex GPT demo mode. Your message has been saved; no AI model was called and no credits are charged.\n\nFor real responses, start Ollama with an installed model or connect a configured Stelex server. Then use this chat for coding, writing, and creative work.';
            } else {
              let result;
              const nativeOllama = providerKind === 'ollama';
              const providerUrl = nativeOllama ? new URL('/api/chat', baseUrl).href : `${baseUrl}/chat/completions`;
              const providerBody = nativeOllama
                ? { model: model.upstreamModel || model.id, messages: requestMessages, stream: false, think: false, options: { num_predict: maxOutputTokens } }
                : { model: model.upstreamModel || model.id, messages: requestMessages, max_tokens: maxOutputTokens, stream: false };
              try {
                result = await fetchProvider(providerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.aiApiKey ? { Authorization: `Bearer ${options.aiApiKey}` } : {}) }, body: JSON.stringify(providerBody), signal: AbortSignal.timeout(options.providerTimeoutMs ?? (nativeOllama ? 300_000 : 120_000)) });
              } catch { providerObservation = { reachable: false, checkedAt: iso() }; throw new HttpError(503, 'The AI provider could not be reached. Credits were returned.', 'PROVIDER_UNAVAILABLE'); }
              if (!result.ok) { await result.body?.cancel(); throw new HttpError(502, `The AI provider returned HTTP ${result.status}. Credits were returned.`, 'PROVIDER_ERROR'); }
              let payload;
              try { payload = await result.json(); }
              catch { throw new HttpError(502, 'The AI provider returned invalid JSON. Credits were returned.', 'INVALID_PROVIDER_RESPONSE'); }
              content = nativeOllama ? payload.message?.content : payload.choices?.[0]?.message?.content;
              inputTokens = nativeOllama ? payload.prompt_eval_count : payload.usage?.prompt_tokens;
              outputTokens = nativeOllama ? payload.eval_count : payload.usage?.completion_tokens;
              if (typeof content !== 'string' || !content.trim() || content.length > 1_000_000 || !integer(inputTokens, 0, maxInputTokens) || !integer(outputTokens, 0, maxOutputTokens)) throw new HttpError(502, 'The AI provider returned an invalid response or missing usage. Credits were returned.', 'INVALID_PROVIDER_RESPONSE');
              charge = Math.ceil((inputTokens + outputTokens) / TOKENS_PER_CREDIT);
              providerObservation = { reachable: true, checkedAt: iso() };
            }
            const time = iso();
            const assistant = { id: randomUUID(), role: 'assistant', content, createdAt: time, model: model.id };
            const completed = transaction(() => {
              if (!conversation) {
                conversation = { id: randomUUID(), title: message.trim().replace(/\s+/g, ' ').slice(0, 70) };
                db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(conversation.id, user.id, conversation.title, time, time);
              }
              db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(randomUUID(), conversation.id, 'user', message.trim(), time, model.id);
              db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(assistant.id, conversation.id, 'assistant', content, time, model.id);
              db.prepare('UPDATE conversations SET updatedAt=? WHERE id=?').run(time, conversation.id);
              db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(reservation - charge, user.id);
              if (reservation) db.prepare('DELETE FROM reservations WHERE id=?').run(reservationId);
              const next = db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance;
              db.prepare('INSERT INTO usage VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), user.id, model.id, inputTokens, outputTokens, charge, demoMode ? 1 : 0, time);
              if (charge) recordLedger(user.id, 'usage', -charge, next, model.id);
              const result = { conversationId: conversation.id, message: assistant, balance: next, usage: getUsage(user.id), demoMode, creditsCharged: charge };
              if (requestId) db.prepare('INSERT INTO chat_requests VALUES(?,?,?,?,?,?)').run(user.id, requestId, inputHash, conversation.id, JSON.stringify(result), time);
              return result;
            });
            reserved = false;
            return json(200, completed);
          } finally {
            if (reserved) transaction(() => {
              db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(reservation, user.id);
              db.prepare('DELETE FROM reservations WHERE id=?').run(reservationId);
            });
            busyUsers.delete(user.id);
          }
        }
        throw new HttpError(404, 'Endpoint not found.', 'NOT_FOUND');
      }
      if (['GET', 'HEAD'].includes(method)) {
        const isAdmin = path === '/admin' || path.startsWith('/admin/');
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
    try { await dispatcher?.close(); }
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
    async close() { if (disposed) return; await new Promise(resolveClose => server.close(resolveClose)); await dispose(); },
  };
  } catch (error) {
    try { await dispatcher?.close(); }
    finally { try { db?.close(); } finally { releaseLock(); } }
    throw error;
  }
}
