import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

const ADMIN = 'private-test-admin-never-a-customer-key';
const PASSWORD = 'test-password-with-private-value';
async function fixture(t, options = {}) {
  const app = await createApp({ adminToken: ADMIN, initialCredits: 0, ...options });
  const base = await app.listen(0);
  t.after(() => app.close());
  const request = async (path, { method = 'GET', body, cookie, admin = false } = {}) => {
    const result = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(admin ? { Authorization: `Bearer ${ADMIN}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = async () => {
    const result = await request('/api/auth/register', { method: 'POST', body: { email: `${randomUUID()}@test.invalid`, name: 'Plan tester', password: PASSWORD } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result;
  };
  const me = session => request('/api/me', { cookie: session.cookie });
  const chat = (session, body = {}) => request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'A brief coding question.', ...body } });
  const mint = body => request('/api/admin/keys', { method: 'POST', admin: true, body: { count: 1, ...body } });
  const redeem = (session, code) => request('/api/credits/redeem', { method: 'POST', cookie: session.cookie, body: { code } });
  const catalog = () => request('/api/admin/plans', { admin: true });
  const update = body => request('/api/admin/plans', { method: 'PUT', admin: true, body });
  return { app, request, register, me, chat, mint, redeem, catalog, update };
}

function provider({ prompt = 101, output = 50, content = 'Test provider answer.' } = {}) {
  const state = { calls: [], fail: false };
  state.fetchImpl = async (url, init) => {
    if (url.endsWith('/models')) return Response.json({ data: [] });
    state.calls.push(JSON.parse(init.body));
    if (state.fail) return new Response('provider unavailable', { status: 503 });
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: prompt, completion_tokens: output } });
  };
  return state;
}
const realOptions = state => ({ demoMode: false, aiBaseUrl: 'http://127.0.0.1:11434/v1', fetchImpl: state.fetchImpl, models: [{ id: 'basic', name: 'Basic', tier: 0, multiplier: 1 }] });

async function setPlan(f, id, change) {
  const result = await f.catalog();
  assert.equal(result.status, 200);
  const body = { plans: result.data.plans.map(plan => plan.id === id ? { ...plan, ...change } : plan), creditPacks: result.data.creditPacks };
  const saved = await f.update(body);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  return body;
}

test('public catalog and new Free Trial account expose percentages and real reset times; catalog edits are protected and atomic', async t => {
  const f = await fixture(t);
  const publicCatalog = await f.request('/api/plans');
  assert.equal(publicCatalog.status, 200);
  assert.deepEqual(publicCatalog.data.plans.map(p => p.id), ['free', 'starter', 'pro', 'max']);
  assert.deepEqual(publicCatalog.data.plans.map(p => p.priceCents), [0, 799, 1499, 2999]);
  assert.equal(publicCatalog.data.verificationEnabled, false);
  const before = Date.now();
  const session = await f.register();
  assert.equal(session.data.subscription.planId, 'free');
  assert.equal(session.data.balance, 0);
  for (const [name, hours] of [['short', 5], ['week', 168]]) {
    const window = session.data.quota[name];
    assert.equal(window.usedPercent, 0);
    assert.equal(window.remainingPercent, 100);
    assert.equal(window.used, 0);
    assert.ok(Date.parse(window.resetAt) >= before + hours * 3_600_000);
    assert.ok(Date.parse(window.resetAt) <= Date.now() + hours * 3_600_000);
  }
  assert.equal((await f.request('/api/admin/plans')).status, 401);
  const current = await f.catalog();
  const invalid = structuredClone(current.data);
  invalid.plans[0].shortWindowHours = 0;
  assert.equal((await f.update(invalid)).status, 400);
  assert.deepEqual((await f.catalog()).data, current.data);
  const changed = await setPlan(f, 'starter', { priceCents: 1190, shortLimit: 777, shortWindowHours: 6 });
  assert.deepEqual((await f.request('/api/plans')).data.plans, changed.plans);
});

test('included usage bills actual provider input and output, retries are free, and provider failure restores both quotas', async t => {
  const p = provider();
  const f = await fixture(t, realOptions(p));
  await setPlan(f, 'free', { maxOutputTokens: 128, shortLimit: 40, weekLimit: 80 });
  const session = await f.register();
  const requestId = randomUUID();
  const first = await f.chat(session, { model: 'basic', requestId });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.creditsCharged, 0);
  assert.equal(first.data.balance, 0);
  assert.equal(first.data.quota.short.used, 2);
  assert.equal(first.data.quota.short.usedPercent, 5);
  assert.equal(first.data.quota.week.used, 2);
  assert.equal(p.calls[0].max_tokens, 128);
  const retry = await f.chat(session, { model: 'basic', requestId });
  assert.equal(retry.status, 200);
  assert.equal(p.calls.length, 1);
  assert.equal((await f.me(session)).data.quota.short.used, 2);
  p.fail = true;
  const failed = await f.chat(session, { model: 'basic' });
  assert.equal(failed.status, 502);
  const after = await f.me(session);
  assert.equal(after.data.quota.short.used, 2);
  assert.equal(after.data.quota.week.used, 2);
  assert.equal(after.data.balance, 0);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM reservations').get().n, 0);
});

test('either exhausted window blocks the provider and code credits pay only the overflow', async t => {
  const p = provider();
  const f = await fixture(t, realOptions(p));
  await setPlan(f, 'free', { maxOutputTokens: 128, shortLimit: 20, weekLimit: 40 });
  const session = await f.register();
  f.app.db.prepare('UPDATE quota_windows SET shortUsed=20 WHERE userId=?').run(session.data.user.id);
  assert.equal((await f.chat(session, { model: 'basic' })).status, 402);
  assert.equal(p.calls.length, 0);
  const keys = await f.mint({ credits: 100 });
  assert.equal(keys.status, 201);
  assert.equal((await f.redeem(session, keys.data.keys[0].code)).status, 200);
  f.app.db.prepare('UPDATE quota_windows SET shortUsed=19 WHERE userId=?').run(session.data.user.id);
  const first = await f.chat(session, { model: 'basic' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.creditsCharged, 1);
  assert.equal(first.data.balance, 99);
  assert.equal(first.data.quota.short.used, 20);
  f.app.db.prepare('UPDATE quota_windows SET shortUsed=0,weekUsed=40 WHERE userId=?').run(session.data.user.id);
  const weekly = await f.chat(session, { model: 'basic' });
  assert.equal(weekly.status, 200);
  assert.equal(weekly.data.creditsCharged, 2);
  assert.equal(weekly.data.balance, 97);
  assert.equal(weekly.data.quota.week.used, 40);
  f.app.db.prepare('UPDATE quota_windows SET shortUsed=10,shortReset=? WHERE userId=?').run(Date.now() - 1, session.data.user.id);
  const renewed = await f.me(session);
  assert.equal(renewed.data.quota.short.used, 0);
  assert.equal(renewed.data.quota.week.used, 40);
  f.app.db.prepare('UPDATE quota_windows SET weekReset=? WHERE userId=?').run(Date.now() - 1, session.data.user.id);
  assert.equal((await f.me(session)).data.quota.week.used, 0);
});

test('plan codes activate once, extend an existing term, route supported thinking, and expire back to Free Trial', async t => {
  const p = provider();
  const f = await fixture(t, { ...realOptions(p), models: [{ id: 'basic', name: 'Basic', tier: 0, multiplier: 1 }, { id: 'deep', name: 'Deep', tier: 2, multiplier: 2, reasoningSupported: true }] });
  const a = await f.register(); const b = await f.register();
  assert.notEqual((await f.chat(a, { model: 'deep' })).status, 200);
  assert.equal(p.calls.length, 0);
  const key = await f.mint({ type: 'plan', planId: 'pro', durationDays: 30 });
  assert.equal(key.status, 201, JSON.stringify(key.data));
  const contested = await Promise.all([a, b].map(session => f.redeem(session, key.data.keys[0].code)));
  assert.deepEqual(contested.map(r => r.status).sort(), [200, 400]);
  const winner = contested[0].status === 200 ? a : b;
  const activated = await f.me(winner);
  assert.equal(activated.data.subscription.planId, 'pro');
  const oldExpiry = Date.parse(activated.data.subscription.expiresAt);
  assert.ok(oldExpiry > Date.now() + 29 * 86_400_000);
  const response = await f.chat(winner, { model: 'deep' });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.quota.short.used, 4);
  assert.equal(p.calls[0].reasoning_effort, 'medium');
  assert.equal(p.calls[0].max_tokens, 4096);
  const followup = await f.chat(winner, { model: 'deep', conversationId: response.data.conversationId, message: 'Use that answer as context.' });
  assert.equal(followup.status, 200);
  assert.deepEqual(p.calls[1].messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  const extension = await f.mint({ type: 'plan', planId: 'pro', durationDays: 15 });
  assert.equal(extension.status, 201);
  assert.equal((await f.redeem(winner, extension.data.keys[0].code)).status, 200);
  const extended = await f.me(winner);
  assert.equal(Date.parse(extended.data.subscription.expiresAt), oldExpiry + 15 * 86_400_000);
  f.app.db.prepare('UPDATE users SET planExpiresAt=? WHERE id=?').run(Date.now() - 1, winner.data.user.id);
  assert.equal((await f.me(winner)).data.subscription.planId, 'free');
  assert.notEqual((await f.chat(winner, { model: 'deep' })).status, 200);
});

test('admin audit stores signups, signins and redeemed purchases without questions, passwords, codes or admin keys', async t => {
  const f = await fixture(t);
  const session = await f.register();
  const email = session.data.user.email;
  assert.equal((await f.request('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).status, 200);
  const key = await f.mint({ credits: 137, note: 'Private sale reference' });
  const code = key.data.keys[0].code;
  assert.equal((await f.redeem(session, code)).status, 200);
  const question = 'QUESTION-MUST-NEVER-APPEAR-IN-ADMIN-AUDIT-' + randomUUID();
  assert.equal((await f.chat(session, { message: question })).status, 200);
  assert.equal((await f.request('/api/admin/events')).status, 401);
  const audit = await f.request('/api/admin/events?limit=100&offset=0', { admin: true });
  assert.equal(audit.status, 200);
  assert.ok(audit.data.total >= 3);
  assert.ok(audit.data.events.some(e => e.email === email));
  assert.ok(audit.data.events.every(e => e.id && e.type && e.createdAt && typeof e.details === 'object'));
  const text = JSON.stringify(audit.data);
  for (const secret of [question, PASSWORD, code, ADMIN, session.cookie]) assert.ok(!text.includes(secret));
  assert.ok(audit.data.events.every(e => !/chat|question|message/i.test(e.type)));
  const page = await f.request('/api/admin/events?limit=1&offset=1', { admin: true });
  assert.equal(page.data.events.length, 1);
  assert.equal(page.data.total, audit.data.total);
});

test('verification requires delivered one-time code, limits wrong guesses and never exposes codes through account APIs', async t => {
  const deliveries = [];
  const f = await fixture(t, { sendVerification: async value => { deliveries.push(value); } });
  assert.equal((await f.request('/api/plans')).data.verificationEnabled, true);
  const session = await f.register();
  assert.equal(session.data.verificationRequired, true);
  assert.equal(session.data.user.emailVerified, false);
  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].code, /^\d{6}$/);
  assert.ok(!JSON.stringify(session.data).includes(deliveries[0].code));
  assert.equal((await f.chat(session)).status, 403);
  const verified = await f.request('/api/auth/verify', { method: 'POST', cookie: session.cookie, body: { code: deliveries[0].code } });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal((await f.me(session)).data.user.emailVerified, true);
  assert.equal((await f.chat(session)).status, 200);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM email_verifications WHERE userId=?').get(session.data.user.id).n, 0);
  const second = await f.register();
  const wrong = deliveries[1].code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.notEqual((await f.request('/api/auth/verify', { method: 'POST', cookie: second.cookie, body: { code: wrong } })).status, 200);
  const locked = await f.request('/api/auth/verify', { method: 'POST', cookie: second.cookie, body: { code: deliveries[1].code } });
  assert.notEqual(locked.status, 200);
  assert.equal((await f.me(second)).data.user.emailVerified, false);
});

test('expired verification codes fail and failed mail delivery remains recoverable without a verified account', async t => {
  const deliveries = [];
  let fail = true;
  const f = await fixture(t, { sendVerification: async value => { if (fail) throw new Error('SMTP secret failure must stay private'); deliveries.push(value); } });
  const session = await f.register();
  assert.equal(session.data.user.emailVerified, false);
  assert.equal(session.data.verificationRequired, true);
  assert.ok(!JSON.stringify(session.data).includes('SMTP secret'));
  fail = false;
  f.app.db.prepare('UPDATE email_verifications SET sentAt=? WHERE userId=?').run(Date.now() - 61_000, session.data.user.id);
  const resent = await f.request('/api/auth/resend', { method: 'POST', cookie: session.cookie });
  assert.equal(resent.status, 200, JSON.stringify(resent.data));
  assert.equal(deliveries.length, 1);
  f.app.db.prepare('UPDATE email_verifications SET expiresAt=? WHERE userId=?').run(Date.now() - 1, session.data.user.id);
  const expired = await f.request('/api/auth/verify', { method: 'POST', cookie: session.cookie, body: { code: deliveries[0].code } });
  assert.notEqual(expired.status, 200);
  assert.equal((await f.me(session)).data.user.emailVerified, false);
});


test('restarting restores interrupted quota and credit reservations without losing accounts, codes or plan settings', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stelex-quota-recovery-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'stelex.sqlite');
  const first = await fixture(t, { dbPath, initialCredits: 100 });
  const saved = await setPlan(first, 'starter', { priceCents: 1190 });
  const session = await first.register();
  const issued = await first.mint({ credits: 75 });
  const id = session.data.user.id;
  const windows = first.app.db.prepare('SELECT * FROM quota_windows WHERE userId=?').get(id);
  first.app.db.prepare('UPDATE users SET balance=97 WHERE id=?').run(id);
  first.app.db.prepare('UPDATE quota_windows SET shortUsed=7,weekUsed=7 WHERE userId=?').run(id);
  first.app.db.prepare('INSERT INTO reservations(id,userId,credits,createdAt,quotaUnits,shortReset,weekReset) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), id, 3, new Date().toISOString(), 7, windows.shortReset, windows.weekReset);
  await first.app.close();
  const second = await fixture(t, { dbPath });
  const restored = await second.me(session);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.balance, 100);
  assert.equal(restored.data.quota.short.used, 0);
  assert.equal(restored.data.quota.week.used, 0);
  assert.equal(second.app.db.prepare('SELECT COUNT(*) n FROM reservations').get().n, 0);
  assert.deepEqual((await second.catalog()).data.plans, saved.plans);
  const redeemed = await second.redeem(session, issued.data.keys[0].code);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.balance, 175);
});

test('longer answers and retained chat context increase measured consumption rather than charging a fixed message fee', async t => {
  const calls = [];
  const f = await fixture(t, {
    demoMode: false, aiBaseUrl: 'http://127.0.0.1:11434/v1', models: [{ id: 'basic', name: 'Basic', tier: 0, multiplier: 1 }],
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const prompt = Math.ceil(body.messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      const output = calls.length === 0 ? 20 : 80;
      calls.push({ body, prompt, output });
      return Response.json({ choices: [{ message: { content: 'A retained answer with useful context.' } }], usage: { prompt_tokens: prompt, completion_tokens: output } });
    },
  });
  await setPlan(f, 'free', { maxOutputTokens: 128, shortLimit: 200, weekLimit: 1000 });
  const session = await f.register();
  const first = await f.chat(session, { model: 'basic', message: 'Describe a program. '.repeat(30) });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const firstUnits = Math.ceil((calls[0].prompt + calls[0].output) / 100);
  assert.equal(first.data.quota.short.used, firstUnits);
  const followup = await f.chat(session, { model: 'basic', conversationId: first.data.conversationId, message: 'Expand that program. '.repeat(30) });
  assert.equal(followup.status, 200, JSON.stringify(followup.data));
  assert.ok(calls[1].prompt > calls[0].prompt);
  assert.ok(calls[1].output > calls[0].output);
  const nextUnits = Math.ceil((calls[1].prompt + calls[1].output) / 100);
  assert.ok(nextUnits > firstUnits);
  assert.equal(followup.data.quota.short.used, firstUnits + nextUnits);
  assert.equal(followup.data.balance, 0);
});
