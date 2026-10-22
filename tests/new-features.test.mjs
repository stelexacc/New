import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';
import { crc32 } from 'node:zlib';

// These tests exercise the real request handler without opening network sockets.
// The separate server suite verifies the actual HTTP transport in CI.
const ADMIN = 'new-feature-private-admin-key';
const PASSWORD = 'integration-test-password';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
const image = () => ({ name: 'pixel.png', mime: 'image/png', encoding: 'base64', content: PNG });
const textFile = (content = 'print("attached code")') => ({ name: 'example.py', mime: 'text/x-python', encoding: 'utf8', content });

async function fixture(t, options = {}) {
  const provider = { calls: [], fail: false };
  const app = await createApp({ adminToken: ADMIN, initialCredits: 1000, quotasEnabled: false,
    demoMode: false, aiBaseUrl: 'http://127.0.0.1:11434/v1',
    models: [{ id: 'qwen3.5-abliterated:9b', name: 'Qwen 3.5 Abliterated 9B', vision: true }],
    fetchImpl: async (_url, init) => {
      provider.calls.push(JSON.parse(init.body));
      if (provider.fail) return new Response('unavailable', { status: 503 });
      return Response.json({ choices: [{ message: { content: 'The attachment was received.' } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
    }, ...options });
  t.after(() => app.close());
  const request = (path, { method = 'GET', body, cookie, admin = false } = {}) => new Promise((resolve, reject) => {
    const source = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = Readable.from(source);
    Object.assign(req, { method, url: path, headers: { host: 'localhost', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}) }, socket: { remoteAddress: '127.0.0.1', encrypted: false } });
    const headers = {}; let status = 200;
    const response = { headersSent: false,
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      writeHead(code, values = {}) { status = code; this.headersSent = true; Object.entries(values).forEach(([name, value]) => this.setHeader(name, value)); },
      end(value) {
        clearTimeout(timer);
        const raw = value === undefined ? Buffer.alloc(0) : Buffer.isBuffer(value) ? value : Buffer.from(String(value));
        let data; try { data = JSON.parse(raw.toString('utf8')); } catch { data = null; }
        resolve({ status, data, raw, headers, cookie: headers['set-cookie']?.split(';')[0] });
      } };
    const timer = setTimeout(() => reject(new Error(`Request did not finish: ${method} ${path}`)), 5000);
    app.server.emit('request', req, response);
  });
  const register = async (email = `${randomUUID()}@test.invalid`) => {
    const result = await request('/api/auth/register', { method: 'POST', body: { email, name: 'Feature tester', password: PASSWORD } });
    assert.equal(result.status, 200, JSON.stringify(result.data)); return result;
  };
  const chat = (session, body = {}) => request('/api/chat', { method: 'POST', cookie: session.cookie, body: { message: 'Please read the attached file.', ...body } });
  return { app, request, register, chat, provider };
}

test('monthly Starter, Pro and Max catalog has 30-day terms and all seven extra-credit price points', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/plans');
  assert.deepEqual(result.data.plans.map(p => p.id), ['free', 'starter', 'pro', 'max']);
  assert.deepEqual(result.data.plans.map(p => p.priceCents), [0, 799, 1499, 2999]);
  assert.ok(result.data.plans.filter(p => p.id !== 'free').every(p => p.durationDays === 30));
  assert.deepEqual(result.data.creditPacks.map(p => p.priceCents), [500, 1000, 2000, 3000, 5000, 7500, 10000]);
  assert.deepEqual(result.data.creditPacks.map(p => p.credits), [1000, 2200, 5000, 8000, 15000, 24000, 35000]);
  const health = await f.request('/api/health');
  assert.equal(health.data.models[0].vision, true);
});

test('admin searches accounts and gives exactly 30 days Pro once; repeat, expiry and privacy remain correct', async t => {
  const f = await fixture(t); const a = await f.register(); const b = await f.register();
  assert.equal((await f.request('/api/admin/users?query=test.invalid', { cookie: a.cookie })).status, 401);
  const users = await f.request(`/api/admin/users?query=${encodeURIComponent(a.data.user.email)}`, { admin: true });
  assert.equal(users.status, 200); assert.equal(users.data.users.length, 1);
  assert.equal(users.data.users[0].id, a.data.user.id); assert.equal(users.data.users[0].password, undefined);
  const payload = { userId: a.data.user.id, planId: 'pro', durationDays: 30, requestId: randomUUID(), reason: 'Free thirty-day promotion' };
  assert.equal((await f.request('/api/admin/grants', { method: 'POST', cookie: a.cookie, body: payload })).status, 401);
  const start = Date.now();
  const first = await f.request('/api/admin/grants', { method: 'POST', admin: true, body: payload });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const expiry = Date.parse(first.data.user.subscription.expiresAt);
  assert.equal(first.data.user.subscription.planId, 'pro');
  assert.ok(expiry >= start + 30 * 86_400_000 && expiry <= Date.now() + 30 * 86_400_000);
  const repeated = await f.request('/api/admin/grants', { method: 'POST', admin: true, body: payload });
  assert.equal(repeated.status, 200); assert.equal(Date.parse(repeated.data.user.subscription.expiresAt), expiry);
  const changed = await f.request('/api/admin/grants', { method: 'POST', admin: true, body: { ...payload, userId: b.data.user.id } });
  assert.equal(changed.status, 409);
  assert.equal((await f.request('/api/me', { cookie: b.cookie })).data.subscription.planId, 'free');
  const marker = `PRIVATE-CHAT-${randomUUID()}`;
  assert.equal((await f.chat(a, { message: marker })).status, 200);
  const audit = await f.request('/api/admin/events', { admin: true });
  assert.ok(audit.data.events.some(e => e.userId === a.data.user.id && JSON.stringify(e.details).includes('pro')));
  assert.ok(!JSON.stringify(audit.data).includes(marker));
  f.app.db.prepare('UPDATE users SET planExpiresAt=? WHERE id=?').run(Date.now() - 1, a.data.user.id);
  assert.equal((await f.request('/api/me', { cookie: a.cookie })).data.subscription.planId, 'free');
});

test('upgrading old Ultra accounts and unused codes preserves paid expiry and operator custom prices', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stelex-old-catalog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'stelex.sqlite');
  const first = await fixture(t, { dbPath }); const user = await first.register();
  const original = (await first.request('/api/admin/plans', { admin: true })).data;
  const legacy = { plans: original.plans.map(plan => plan.id === 'max' ? { ...plan, id: 'ultra', name: 'Ultra', priceCents: 3888 } : plan.id === 'starter' ? { ...plan, priceCents: 1234 } : plan.id === 'pro' ? { ...plan, priceCents: 1990 } : plan), creditPacks: [{ id: 'boost', name: 'Credit Boost', credits: 500, priceCents: 490, currency: 'EUR' }, { id: 'extra', name: 'Credit Extra', credits: 1500, priceCents: 1190, currency: 'EUR' }, { id: 'power', name: 'Credit Power', credits: 5000, priceCents: 2990, currency: 'EUR' }] };
  const expiry = Date.now() + 12 * 86_400_000;
  first.app.db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(legacy));
  first.app.db.prepare("UPDATE users SET planId='ultra',planExpiresAt=? WHERE id=?").run(expiry, user.data.user.id);
  const key = await first.request('/api/admin/keys', { method: 'POST', admin: true, body: { type: 'plan', planId: 'max', durationDays: 30, count: 1 } });
  assert.equal(key.status, 201);
  first.app.db.prepare("UPDATE credit_keys SET planId='ultra' WHERE id=?").run(key.data.keys[0].id);
  await first.app.close();
  const second = await fixture(t, { dbPath });
  const me = await second.request('/api/me', { cookie: user.cookie });
  assert.equal(me.data.subscription.planId, 'max'); assert.equal(Date.parse(me.data.subscription.expiresAt), expiry);
  const catalog = (await second.request('/api/plans')).data;
  assert.equal(catalog.plans.find(p => p.id === 'starter').priceCents, 1234);
  assert.equal(catalog.plans.find(p => p.id === 'max').priceCents, 3888);
  assert.equal(second.app.db.prepare('SELECT planId FROM credit_keys WHERE id=?').get(key.data.keys[0].id).planId, 'max');
  const redeemed = await second.request('/api/credits/redeem', { method: 'POST', cookie: user.cookie, body: { code: key.data.keys[0].code } });
  assert.equal(redeemed.status, 200); assert.equal(Date.parse(redeemed.data.subscription.expiresAt), expiry + 30 * 86_400_000);
});

test('an unmodified old price catalog upgrades to all new monthly prices and extra-credit packs', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stelex-default-catalog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'stelex.sqlite');
  const first = await fixture(t, { dbPath });
  const original = (await first.request('/api/plans')).data;
  const prices = { starter: 990, pro: 1990, max: 3990 };
  const legacy = { plans: original.plans.map(plan => ({ ...plan, id: plan.id === 'max' ? 'ultra' : plan.id, priceCents: prices[plan.id] ?? 0 })), creditPacks: [{ id: 'boost', name: 'Credit Boost', credits: 500, priceCents: 490, currency: 'EUR' }, { id: 'extra', name: 'Credit Extra', credits: 1500, priceCents: 1190, currency: 'EUR' }, { id: 'power', name: 'Credit Power', credits: 5000, priceCents: 2990, currency: 'EUR' }] };
  first.app.db.prepare("UPDATE settings SET value=? WHERE key='catalog'").run(JSON.stringify(legacy));
  await first.app.close();
  const second = await fixture(t, { dbPath });
  const catalog = (await second.request('/api/plans')).data;
  assert.deepEqual(catalog.plans.map(plan => plan.id), ['free', 'starter', 'pro', 'max']);
  assert.deepEqual(catalog.plans.map(plan => plan.priceCents), [0, 799, 1499, 2999]);
  assert.deepEqual(catalog.creditPacks.map(pack => pack.priceCents), [500, 1000, 2000, 3000, 5000, 7500, 10000]);
});

test('text and image bytes reach a capable provider, persist privately, and attachment-only requests work', async t => {
  const f = await fixture(t); const a = await f.register(); const b = await f.register();
  const attachments = [textFile(), image()];
  const result = await f.chat(a, { message: '', attachments, requestId: randomUUID() });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const sent = f.provider.calls[0].messages.at(-1).content;
  assert.ok(Array.isArray(sent));
  assert.ok(sent.some(part => part.type === 'text' && part.text.includes('print("attached code")')));
  assert.equal(sent.find(part => part.type === 'image_url').image_url.url, `data:image/png;base64,${PNG}`);
  const history = await f.request(`/api/conversations/${result.data.conversationId}`, { cookie: a.cookie });
  const stored = history.data.messages.find(message => message.role === 'user');
  assert.equal(stored.attachments.length, 2);
  const storedImage = stored.attachments.find(attachment => attachment.mime === 'image/png');
  assert.ok(storedImage.url.startsWith('/api/attachments/')); assert.equal(storedImage.content, undefined);
  const own = await f.request(storedImage.url, { cookie: a.cookie });
  assert.equal(own.status, 200); assert.deepEqual(own.raw, Buffer.from(PNG, 'base64'));
  assert.equal((await f.request(storedImage.url, { cookie: b.cookie })).status, 404);
  assert.equal((await f.request(storedImage.url)).status, 401);
  const audit = await f.request('/api/admin/events', { admin: true });
  assert.ok(!JSON.stringify(audit.data).includes('print("attached code")'));
});

test('a valid image at the full 5 MiB boundary reaches the provider without a decoder stack overflow', async t => {
  const f = await fixture(t); const owner = await f.register();
  const pixel = Buffer.from(PNG, 'base64');
  // Add a valid uncompressed PNG text chunk while retaining its original pixels.
  const data = Buffer.alloc(5 * 1024 * 1024 - pixel.length - 12, 65);
  data.write('Comment\0', 0, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0); chunk.write('tEXt', 4, 'ascii'); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  const bytes = Buffer.concat([pixel.subarray(0, pixel.length - 12), chunk, pixel.subarray(pixel.length - 12)]);
  assert.equal(bytes.length, 5 * 1024 * 1024);
  const content = bytes.toString('base64');
  const result = await f.chat(owner, { attachments: [{ ...image(), content }] });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const sentImage = f.provider.calls[0].messages.at(-1).content.find(part => part.type === 'image_url');
  assert.equal(sentImage.image_url.url, `data:image/png;base64,${content}`);
});

test('attachment retries bill once, changed bytes conflict, and provider failure leaves no saved attachments or debit', async t => {
  const f = await fixture(t); const a = await f.register();
  const body = { attachments: [image()], requestId: randomUUID() };
  const first = await f.chat(a, body); assert.equal(first.status, 200, JSON.stringify(first.data));
  const repeat = await f.chat(a, body); assert.equal(repeat.status, 200); assert.equal(f.provider.calls.length, 1);
  assert.equal(repeat.data.balance, first.data.balance);
  const conflict = await f.chat(a, { ...body, attachments: [textFile('changed bytes')] });
  assert.equal(conflict.status, 409); assert.equal(f.provider.calls.length, 1);
  const before = (await f.request('/api/conversations', { cookie: a.cookie })).data.conversations.length;
  f.provider.fail = true;
  const failure = await f.chat(a, { attachments: [textFile('failed request private text')], requestId: randomUUID() });
  assert.equal(failure.status, 502);
  const me = await f.request('/api/me', { cookie: a.cookie }); assert.equal(me.data.balance, first.data.balance);
  assert.equal((await f.request('/api/conversations', { cookie: a.cookie })).data.conversations.length, before);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM reservations').get().n, 0);
});

test('unsupported image models and malformed, oversized or excessive attachments never call or debit the provider', async t => {
  const f = await fixture(t, { models: [{ id: 'text-only', name: 'Text only', vision: false }] }); const a = await f.register();
  const denied = await f.chat(a, { attachments: [image()] });
  assert.equal(denied.status, 422); assert.equal(denied.data.code, 'IMAGE_NOT_SUPPORTED');
  const capable = await fixture(t); const owner = await capable.register();
  const invalid = [
    [{ ...image(), content: 'not base64!!!' }],
    [{ ...image(), content: Buffer.from('<svg>invalid image</svg>').toString('base64') }],
    [{ ...image(), mime: 'image/svg+xml' }],
    [{ ...image(), content: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(5 * 1024 * 1024)]).toString('base64') }],
    [textFile('x'.repeat(64 * 1024 + 1))],
    [textFile('x'.repeat(60 * 1024)), { ...textFile('x'.repeat(60 * 1024)), name: 'two.py' }],
    Array.from({ length: 5 }, (_, i) => ({ ...textFile(), name: `${i}.py` }))
  ];
  for (const attachments of invalid) {
    const result = await capable.chat(owner, { attachments });
    assert.ok(result.status === 400 || result.status === 413 || result.status === 415, JSON.stringify(result.data));
  }
  assert.equal(f.provider.calls.length, 0);
  assert.equal(capable.provider.calls.length, 0);
  assert.equal((await capable.request('/api/me', { cookie: owner.cookie })).data.balance, 1000);
  assert.equal(capable.app.db.prepare('SELECT COUNT(*) n FROM reservations').get().n, 0);
});
