import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';

const ADMIN = 'test-admin-secret-not-for-production';
async function fixture(t, options = {}) {
  const app = await createApp({ quotasEnabled: false, adminToken: ADMIN, ...options });
  const base = await app.listen(0);
  t.after(() => app.close());
  const request = async (path, { method = 'GET', body, cookie, admin = false, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(admin ? { Authorization: `Bearer ${ADMIN}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data; try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  };
  const register = async (email = `${Math.random()}@test.invalid`) => {
    const result = await request('/api/auth/register', { method: 'POST', body: { email, password: 'long-test-password', name: 'Tester' } });
    assert.equal(result.status, 200); return result;
  };
  return { app, base, request, register };
}

test('registration, session login/logout and private API boundaries', async t => {
  const { request, register } = await fixture(t);
  assert.equal((await request('/api/me')).status, 401);
  const session = await register('owner@test.invalid');
  assert.equal(session.data.balance, 500);
  assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const me = await request('/api/me', { cookie: session.cookie });
  assert.equal(me.data.user.email, 'owner@test.invalid');
  assert.equal(me.data.user.password, undefined);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'owner@test.invalid', password: 'wrong-password' } })).status, 401);
  const login = await request('/api/auth/login', { method: 'POST', body: { email: 'owner@test.invalid', password: 'long-test-password' } });
  assert.equal(login.status, 200);
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: session.cookie })).status, 200);
  assert.equal((await request('/api/me', { cookie: session.cookie })).status, 401);
});

test('admin tokens guard minting; codes redeem exactly once across concurrent accounts', async t => {
  const { request, register } = await fixture(t, { initialCredits: 0 });
  const a = await register(); const b = await register();
  assert.equal((await request('/api/admin/keys', { method: 'POST', body: { credits: 100 } })).status, 401);
  assert.equal((await request('/api/admin/keys', { method: 'POST', admin: true, body: { credits: 1.5 } })).status, 400);
  const minted = await request('/api/admin/keys', { method: 'POST', admin: true, body: { credits: 137, count: 2, note: 'Sale #1' } });
  assert.equal(minted.status, 201); assert.equal(minted.data.keys.length, 2);
  const code = minted.data.keys[0].code;
  const results = await Promise.all([a, b].map(session => request('/api/credits/redeem', { method: 'POST', cookie: session.cookie, body: { code: code.toLowerCase(), language: 'de' } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.match(results.find(r => r.status === 200).data.message, /Herzlichen Glückwunsch.*137/);
  const balances = await Promise.all([a, b].map(session => request('/api/me', { cookie: session.cookie })));
  assert.equal(balances.reduce((n, r) => n + r.data.balance, 0), 137);
  const metadata = await request('/api/admin/keys', { admin: true });
  assert.equal(metadata.data.keys.filter(k => k.status === 'redeemed').length, 1);
  assert.equal(metadata.data.keys.some(k => 'code' in k || 'codeHash' in k), false);
  const stats = await request('/api/admin/stats', { admin: true });
  assert.equal(stats.data.creditsRedeemed, 137);
  assert.equal(stats.data.creditsIssued, 274);
});

test('demo chats are explicitly labelled, free, persisted and isolated between accounts', async t => {
  const { request, register } = await fixture(t);
  const a = await register(); const b = await register();
  const result = await request('/api/chat', { method: 'POST', cookie: a.cookie, body: { message: 'Build a todo app.', model: 'stelex-fast', language: 'en' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.creditsCharged, 0);
  assert.match(result.data.message.content, /demo mode/);
  assert.equal(result.data.balance, 500);
  assert.equal(result.data.usage.responses, 1);
  const id = result.data.conversationId;
  const history = await request(`/api/conversations/${id}`, { cookie: a.cookie });
  assert.deepEqual(history.data.messages.map(m => m.role), ['user', 'assistant']);
  assert.equal((await request(`/api/conversations/${id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await request(`/api/conversations/${id}`, { method: 'DELETE', cookie: b.cookie })).status, 404);
  assert.equal((await request('/api/chat', { method: 'POST', cookie: b.cookie, body: { message: 'x', conversationId: id } })).status, 404);
  assert.equal((await request(`/api/conversations/${id}`, { method: 'DELETE', cookie: a.cookie })).status, 200);
  assert.equal((await request(`/api/conversations/${id}`, { cookie: a.cookie })).status, 404);
});

test('upstream usage charges exact rounded token credits; failures refund reservations', async t => {
  let failure = false; let received;
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); return res.end('{"data":[]}'); }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    if (failure) { res.writeHead(503); return res.end('temporarily down'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'Hier ist deine Antwort.' } }], usage: { prompt_tokens: 101, completion_tokens: 150 } }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const { request, register } = await fixture(t, { aiBaseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, demoMode: false, initialCredits: 100, models: [{ id: 'test-model', name: 'Test Model' }] });
  const session = await register();
  const health = await request('/api/health');
  assert.equal(health.data.provider.reachable, true);
  const result = await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Hallo', model: 'test-model', language: 'de' } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.creditsCharged, 3);
  assert.equal(result.data.balance, 97);
  assert.equal(result.data.usage.inputTokens, 101);
  assert.equal(received.model, 'test-model');
  assert.match(received.messages[0].content, /German/);
  failure = true;
  const failed = await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Second request', model: 'test-model' } });
  assert.equal(failed.status, 502);
  const me = await request('/api/me', { cookie: session.cookie });
  assert.equal(me.data.balance, 97);
  assert.equal(me.data.usage.responses, 1);
  const ledger = await request('/api/credits/ledger', { cookie: session.cookie });
  assert.equal(ledger.data.entries.filter(e => e.type === 'usage').length, 1);
});

test('no credits prevents upstream call and empty provider reply does not debit', async t => {
  let calls = 0;
  const options = { aiBaseUrl: 'http://127.0.0.1:11434/v1', demoMode: false, initialCredits: 0, fetchImpl: async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 5, completion_tokens: 0 } })); } };
  const { request, register } = await fixture(t, options);
  const session = await register();
  assert.equal((await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Hello' } })).status, 402);
  assert.equal(calls, 0);
  const keys = await request('/api/admin/keys', { method: 'POST', admin: true, body: { credits: 100 } });
  await request('/api/credits/redeem', { method: 'POST', cookie: session.cookie, body: { code: keys.data.keys[0].code } });
  assert.equal((await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Hello' } })).status, 502);
  assert.equal((await request('/api/me', { cookie: session.cookie })).data.balance, 100);
});

test('a retried chat request returns its committed response without another provider call or charge', async t => {
  let calls = 0;
  const { request, register, app } = await fixture(t, {
    demoMode: false, initialCredits: 100, aiBaseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: 'Idempotent answer.' } }], usage: { prompt_tokens: 101, completion_tokens: 150 } })); },
  });
  const session = await register();
  const body = { message: 'Generate this once.', language: 'en', requestId: randomUUID() };
  const first = await request('/api/chat', { method: 'POST', cookie: session.cookie, body });
  assert.equal(first.status, 200);
  assert.equal(first.data.balance, 97);
  const retry = await request('/api/chat', { method: 'POST', cookie: session.cookie, body });
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data, first.data);
  assert.equal(calls, 1);
  const me = await request('/api/me', { cookie: session.cookie });
  assert.equal(me.data.balance, 97); assert.equal(me.data.usage.responses, 1);
  const conflict = await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { ...body, message: 'Different input.' } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.code, 'REQUEST_ID_REUSED');
  assert.equal(calls, 1);
  const another = await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { ...body, requestId: randomUUID() } });
  assert.equal(another.status, 200); assert.equal(calls, 2); assert.equal(another.data.balance, 94);
  await request(`/api/conversations/${first.data.conversationId}`, { method: 'DELETE', cookie: session.cookie });
  assert.equal(app.db.prepare('SELECT COUNT(*) count FROM chat_requests WHERE requestId=?').get(body.requestId).count, 0);
});

test('rejects cross-origin requests, oversized bodies and invalid model IDs', async t => {
  const { request, register } = await fixture(t);
  assert.equal((await request('/api/health', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  const session = await register();
  assert.equal((await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Hello', model: 'nonexistent' } })).status, 400);
  assert.equal((await request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'a'.repeat(100_000) } })).status, 413);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { email: 'valid@example.org', password: 'short' } })).status, 400);
});

test('redemption brute force is rate limited', async t => {
  const { request, register } = await fixture(t);
  const session = await register();
  let last;
  for (let i = 0; i < 21; i++) last = await request('/api/credits/redeem', { method: 'POST', cookie: session.cookie, body: { code: 'bad' } });
  assert.equal(last.status, 429);
  const another = await register();
  assert.equal((await request('/api/credits/redeem', { method: 'POST', cookie: another.cookie, body: { code: 'bad' } })).status, 400);
});

test('an account login throttle does not block other users behind the same proxy', async t => {
  const { request, register } = await fixture(t);
  await register('limited@test.invalid'); await register('other@test.invalid');
  let result;
  for (let index = 0; index < 15; index++) result = await request('/api/auth/login', { method: 'POST', body: { email: 'limited@test.invalid', password: 'wrong-test-password' } });
  assert.equal(result.status, 429);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'other@test.invalid', password: 'long-test-password' } })).status, 200);
});

test('interrupted durable reservations are refunded when the single backend restarts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stelex-recovery-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'test.sqlite');
  const first = await createApp({ quotasEnabled: false, dbPath, adminToken: ADMIN, initialCredits: 100 });
  const base = await first.listen(0);
  const signup = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'restart@test.invalid', password: 'restart-test-password' }) });
  const { user } = await signup.json();
  first.db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(23, user.id);
  first.db.prepare('INSERT INTO reservations(id,userId,credits,createdAt) VALUES(?,?,?,?)').run('interrupted-call', user.id, 23, new Date().toISOString());
  await assert.rejects(createApp({ quotasEnabled: false, dbPath, adminToken: ADMIN }), /Database is already in use/);
  assert.equal(first.db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance, 77);
  assert.equal(first.db.prepare('SELECT COUNT(*) count FROM reservations').get().count, 1);
  await first.close();
  assert.equal(existsSync(`${dbPath}.lock`), false);
  const second = await createApp({ quotasEnabled: false, dbPath, adminToken: ADMIN });
  await second.listen(0);
  assert.equal(second.db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance, 100);
  assert.equal(second.db.prepare('SELECT COUNT(*) count FROM reservations').get().count, 0);
  await second.close();
});

test('stale process locks recover, while initialization and listening failures release locks', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stelex-lock-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'test.sqlite');
  const deadProcess = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  assert.equal(deadProcess.status, 0);
  const deadPid = Number(deadProcess.stdout);
  assert.throws(() => process.kill(deadPid, 0), error => error.code === 'ESRCH');
  writeFileSync(`${dbPath}.lock`, JSON.stringify({ pid: deadPid, nonce: 'interrupted-process' }));
  const recovered = await createApp({ quotasEnabled: false, dbPath });
  await recovered.listen(0); await recovered.close();
  assert.equal(existsSync(`${dbPath}.lock`), false);
  await assert.rejects(createApp({ quotasEnabled: false, dbPath, initialCredits: -1 }), /Invalid initialCredits/);
  assert.equal(existsSync(`${dbPath}.lock`), false);
  const occupied = http.createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const collision = await createApp({ quotasEnabled: false, dbPath });
  await assert.rejects(collision.listen(occupied.address().port), error => error.code === 'EADDRINUSE');
  assert.equal(existsSync(`${dbPath}.lock`), false);
  const restarted = await createApp({ quotasEnabled: false, dbPath });
  await restarted.listen(0); await restarted.close();
});

test('public origin is explicit, Secure cookies follow configuration, DNS rebinding hosts are rejected', async t => {
  const { request, base } = await fixture(t, { publicUrl: 'https://stelex.example' });
  assert.equal((await request('/api/health', { headers: { Origin: 'https://stelex.example', Host: 'stelex.example' } })).status, 200);
  assert.equal((await request('/api/health', { headers: { Origin: base } })).status, 403);
  assert.equal((await request('/api/health', { headers: { Origin: 'https://attacker.invalid', Host: 'attacker.invalid' } })).status, 403);
  const signup = await request('/api/auth/register', { method: 'POST', body: { email: 'tls@test.invalid', password: 'secure-cookie-password' }, headers: { Origin: 'https://stelex.example', Host: 'stelex.example' } });
  assert.equal(signup.status, 200);
  assert.match(signup.headers.get('set-cookie'), /; Secure/);
});
