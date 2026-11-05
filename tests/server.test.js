import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { passwordHash } from '../src/auth.js';
import { createApp } from '../src/server.js';
import { example } from '../src/example.js';
const password = 'test-only-password-Long123!';
const hash = await passwordHash(password);
async function setup(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jra-capture-test-'));
  const config = { DATABASE_PATH: join(dir, 'test.db'), ADMIN_PASSWORD_HASH: hash, APP_ORIGIN: 'http://localhost:3000', ...overrides };
  let app = createApp(config);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '', csrf = '';
  const call = async (path, body, options = {}) => {
    const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: config.APP_ORIGIN, Cookie: cookie, 'X-CSRF-Token': csrf, ...options.headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie') };
  };
  const login = async () => { const r = await call('/api/admin/login', { password }); cookie = r.cookie?.split(';')[0] ?? ''; csrf = r.data.csrf ?? ''; return r; };
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { call, login, config, get app() { return app; }, restart: async () => { await app.close(); app = createApp(config); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.server.address().port}`; } };
}
test('unconfigured server exposes setup status and refuses all admin operations', async t => {
  const s = await setup(t, { ADMIN_PASSWORD_HASH: '' });
  assert.equal((await s.call('/api/health')).data.configured, false);
  assert.equal((await s.call('/api/admin/login', { password })).status, 503);
});
test('unauthorized readers cannot validate, publish, inspect history or restore', async t => {
  const s = await setup(t);
  for (const [path, body] of [['history', undefined], ['validate', { raw: example }], ['publish', { raw: example }], ['restore', { revisionId: 1 }]]) assert.equal((await s.call('/api/admin/' + path, body)).status, 401);
  assert.equal((await s.call('/api/public')).data.publication, null);
});
test('login establishes HttpOnly session; csrf and origin are required for writes', async t => {
  const s = await setup(t);
  const login = await s.login(); assert.equal(login.status, 200); assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Strict/);
  assert.equal((await s.call('/api/admin/publish', {}, { headers: { Origin: 'https://hostile.example' } })).status, 403);
  assert.equal((await s.call('/api/admin/publish', {}, { headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  assert.equal((await s.call('/api/admin/session')).status, 200);
});
test('invalid or unreviewed data never changes published data', async t => {
  const s = await setup(t); await s.login();
  assert.equal((await s.call('/api/admin/publish', { raw: '{', expectedRevision: 0, confirmWarnings: true })).status, 422);
  assert.equal((await s.call('/api/admin/publish', { raw: example, expectedRevision: 0 })).status, 422);
  assert.equal((await s.call('/api/public')).data.publication, null);
});
test('validation is read-only; publish is durable, restores append history, stale writes conflict', async t => {
  const s = await setup(t); await s.login();
  const validation = await s.call('/api/admin/validate', { raw: JSON.stringify(example) });
  assert.equal(validation.data.ok, true); assert.equal(validation.data.revisionId, 0);
  assert.equal((await s.call('/api/public')).data.publication, null);
  const first = await s.call('/api/admin/publish', { raw: example, expectedRevision: 0, confirmWarnings: true }); assert.equal(first.status, 200);
  const changed = structuredClone(example); changed.notes = 'second publication';
  assert.equal((await s.call('/api/admin/publish', { raw: changed, expectedRevision: 0, confirmWarnings: true })).status, 409);
  assert.equal((await s.call('/api/admin/history')).data.revisions.length, 1);
  const second = await s.call('/api/admin/publish', { raw: changed, expectedRevision: 1, confirmWarnings: true }); assert.equal(second.data.publication.id, 2);
  const restore = await s.call('/api/admin/restore', { revisionId: 1, expectedRevision: 2, confirmWarnings: true });
  assert.equal(restore.data.publication.id, 3); assert.equal(restore.data.publication.restoredFrom, 1);
  assert.deepEqual(restore.data.publication.data, first.data.publication.data);
  await s.restart();
  assert.equal((await s.call('/api/public')).data.publication.id, 3);
  assert.equal((await s.call('/api/admin/history')).data.revisions.length, 3);
  await s.call('/api/admin/logout', {});
  assert.equal((await s.call('/api/admin/history')).status, 401);
});
test('failed transaction rolls back revision and publication pointer together', async t => {
  const s = await setup(t);
  s.app.store.publish(example, 0);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => s.app.store.publish(cyclic, 1));
  assert.equal(s.app.store.current().id, 1); assert.equal(s.app.store.history().length, 1);
});
test('five failed passwords are throttled and limits survive restart', async t => {
  const s = await setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await s.call('/api/admin/login', { password: 'wrong' })).status, 401);
  await s.restart(); assert.equal((await s.call('/api/admin/login', { password })).status, 429);
});
test('production misconfiguration is explicit; secure origin issues Secure cookies', async t => {
  const s = await setup(t, { NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' });
  assert.equal((await s.call('/api/health')).data.configured, false);
  const secure = await setup(t, { NODE_ENV: 'production', APP_ORIGIN: 'https://schedule.example.com' });
  assert.match((await secure.login()).cookie, /Secure/);
});
