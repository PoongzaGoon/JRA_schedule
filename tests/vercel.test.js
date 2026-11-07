import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@libsql/client';
import { openRemoteStore } from '../src/remote-store.js';
import { ConflictError } from '../src/store-schema.js';
import { createApp } from '../src/server.js';
import { passwordHash } from '../src/auth.js';
import { example } from '../src/example.js';
import handler from '../api/index.js';

async function database(t) {
  const dir = await mkdtemp(join(tmpdir(), 'jra-libsql-'));
  const url = 'file:' + join(dir, 'test.db');
  const clients = [];
  const connect = () => { const client = createClient({ url }); clients.push(client); return client; };
  t.after(async () => { clients.forEach(c => c.close()); await rm(dir, { recursive: true, force: true }); });
  return { connect };
}

test('independent function instances share publications, sessions and login limits', async t => {
  const db = await database(t);
  const first = openRemoteStore({}, db.connect());
  const second = openRemoteStore({}, db.connect());
  await first.publish(example, 0);
  assert.equal((await second.current()).id, 1);
  await assert.rejects(second.publish(example, 0), ConflictError);
  assert.equal((await first.history()).length, 1);
  await first.addSession('session-hash', 'csrf-value');
  assert.equal((await second.session('session-hash')).csrf, 'csrf-value');
  for (let i = 0; i < 5; i++) await first.failedLogin('ip');
  assert.equal(await second.limited('ip'), true);
  await second.removeSession('session-hash');
  assert.equal(await first.session('session-hash'), undefined);
});

test('libSQL transaction rolls back inserted revision when publication update fails', async t => {
  const db = await database(t);
  const client = db.connect();
  const store = openRemoteStore({}, client);
  await store.ready();
  await client.execute("CREATE TRIGGER reject_publication BEFORE INSERT ON publication BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  await assert.rejects(store.publish(example, 0));
  assert.deepEqual(await store.history(), []);
  assert.equal(await store.current(), null);
  await client.execute('DROP TRIGGER reject_publication');
  assert.equal((await store.publish(example, 0)).id, 1);
});

test('simultaneous writers never create two publications from the same expected revision', async t => {
  const db = await database(t);
  const stores = [openRemoteStore({}, db.connect()), openRemoteStore({}, db.connect())];
  for (const store of stores) await store.ready();
  const results = await Promise.allSettled(stores.map(store => store.publish(example, 0)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert(results.find(r => r.status === 'rejected').reason instanceof ConflictError);
  assert.equal((await stores[0].history()).length, 1);
});

test('expired sessions and login limits are ignored; failed initialization can retry', async t => {
  const db = await database(t);
  const client = db.connect();
  const store = openRemoteStore({}, client);
  await store.ready();
  await client.execute("INSERT INTO sessions VALUES('expired','csrf',0)");
  await client.execute("INSERT INTO login_limits VALUES('ip',5,0)");
  assert.equal(await store.session('expired'), undefined);
  assert.equal(await store.limited('ip'), false);
  await store.failedLogin('ip');
  assert.equal(await store.limited('ip'), false);
  const retryClient = db.connect();
  const executeMultiple = retryClient.executeMultiple.bind(retryClient);
  let fail = true;
  retryClient.executeMultiple = (...args) => { if (fail) { fail = false; return Promise.reject(new Error('temporary outage')); } return executeMultiple(...args); };
  const retryStore = openRemoteStore({}, retryClient);
  await assert.rejects(retryStore.ready(), /temporary outage/);
  await retryStore.ready();
  assert.equal(await retryStore.current(), null);
});

test('Vercel refuses local filesystem storage and insecure remote URLs', async () => {
  const app = createApp({ VERCEL: '1', DATABASE_PATH: '/unwritable/should-not-exist.db' });
  assert.equal(app.store, null);
  assert.equal(app.configured, false);
  await app.close();
  const incomplete = createApp({ DATABASE_PATH: '/unwritable/should-not-exist.db', TURSO_DATABASE_URL: 'libsql://db.example.com' });
  assert.equal(incomplete.store, null);
  await incomplete.close();
  assert.throws(() => openRemoteStore({ TURSO_DATABASE_URL: 'http://db.example.com', TURSO_AUTH_TOKEN: 'not-a-real-token' }), /HTTPS/);
});

test('serverless handler accepts Vercel parsed bodies, enforces size and preserves auth errors', async t => {
  const db = await database(t);
  const password = 'test-serverless-password-123';
  const app = createApp({ VERCEL: '1', APP_ORIGIN: 'https://schedule.example', ADMIN_PASSWORD_HASH: await passwordHash(password) }, { store: openRemoteStore({}, db.connect()) });
  // Vercel supplies req.body; exercise the exported handler without app.server.listen.
  const server = createServer((req, res) => {
    req.body = req.headers['x-test-large'] ? { password: 'x'.repeat(2 * 1024 * 1024) } : { password };
    return app.handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: 'https://schedule.example' };
  const login = await fetch(base + '/api/admin/login', { method: 'POST', headers });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /Secure/);
  assert.equal(typeof (await login.json()).csrf, 'string');
  assert.equal((await fetch(base + '/api/admin/login', { method: 'POST', headers: { ...headers, 'x-test-large': '1' } })).status, 413);
  assert.equal((await fetch(base + '/api/admin/publish', { method: 'POST', headers: { ...headers, Origin: 'https://attacker.example' } })).status, 403);
});

test('Vercel entrypoint serves API JSON without starting a listening application server', async t => {
  const keys = ['VERCEL', 'DATABASE_PATH', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.VERCEL = '1';
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).storage, false);
  const denied = await fetch(base + '/api/admin/login', { method: 'POST' });
  assert.equal(denied.status, 503);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
});
