import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore, ConflictError } from './store.js';
import { openRemoteStore } from './remote-store.js';
import { verifyPassword, validHash, token, digest } from './auth.js';
import { validateSchedule } from './schema.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 2 * 1024 * 1024;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'application/json 요청이 필요합니다.');
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BODY) throw new HttpError(413, '입력은 최대 2MB입니다.');
    try { return JSON.parse(raw); }
    catch { throw new HttpError(400, 'JSON 요청 문법을 확인하세요.'); }
  }
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, '입력은 최대 2MB입니다.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON 요청 문법을 확인하세요.'); }
}
export function createApp(config = process.env, options = {}) {
  let origin;
  try {
    const u = new URL(config.APP_ORIGIN);
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash || !['http:', 'https:'].includes(u.protocol)) throw new Error();
    if (config.NODE_ENV === 'production' && u.protocol !== 'https:') throw new Error();
    origin = u.origin;
  } catch { origin = null; }
  // Vercel's filesystem is ephemeral: never fall back to a local DB there.
  const remoteRequested = !!(config.TURSO_DATABASE_URL || config.TURSO_AUTH_TOKEN);
  const store = options.store ?? (remoteRequested
    ? config.TURSO_DATABASE_URL && config.TURSO_AUTH_TOKEN ? openRemoteStore(config) : null
    : !config.VERCEL && config.DATABASE_PATH ? openStore(config.DATABASE_PATH) : null);
  const configured = !!store && validHash(config.ADMIN_PASSWORD_HASH) && !!origin;
  const staticRoot = resolve(root, existsSync(resolve(root, 'dist/index.html')) ? 'dist' : 'public');
  const files = { '/': ['index.html', 'text/html'], '/admin': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/example.json': ['example.json', 'application/json'], '/schedule.schema.json': ['schedule.schema.json', 'application/json'], '/extraction-prompt.txt': ['extraction-prompt.txt', 'text/plain'] };
  const cookie = value => `jra_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 28800 : 0}${origin?.startsWith('https:') ? '; Secure' : ''}`;
  const handler = async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && files[path]) {
        const [name, type] = files[path];
        const data = await readFile(resolve(staticRoot, name));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(data);
      }
      if (store?.ready) await store.ready();
      if (path === '/api/health' && req.method === 'GET') return send(200, { configured, storage: !!store, authentication: validHash(config.ADMIN_PASSWORD_HASH), origin: !!origin });
      if (path === '/api/public' && req.method === 'GET') return send(200, { publication: await store?.current() ?? null, configured });
      if (!path.startsWith('/api/admin/')) return send(404, { message: '페이지를 찾을 수 없습니다.' });
      if (!configured) throw new HttpError(503, '설정이 필요합니다. TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (로컬: DATABASE_PATH), ADMIN_PASSWORD_HASH, APP_ORIGIN을 확인하세요.');
      if (req.method !== 'GET' && req.headers.origin !== origin) throw new HttpError(403, '허용되지 않은 요청 출처입니다. APP_ORIGIN을 확인하세요.');
      if (path === '/api/admin/login' && req.method === 'POST') {
        const address = config.VERCEL === '1' ? req.headers['x-forwarded-for']?.split(',')[0]?.trim() : null;
        const key = digest(address || req.socket?.remoteAddress || 'unknown');
        if (await store.limited(key)) throw new HttpError(429, '로그인 시도가 많습니다. 15분 후 다시 시도하세요.');
        const input = await body(req);
        if (!await verifyPassword(input?.password, config.ADMIN_PASSWORD_HASH)) {
          await store.failedLogin(key); throw new HttpError(401, '비밀번호를 확인하세요.');
        }
        await store.clearLimit(key);
        const session = token(), csrf = token();
        await store.addSession(digest(session), csrf); res.setHeader('Set-Cookie', cookie(session));
        return send(200, { csrf, revisionId: (await store.current())?.id ?? 0 });
      }
      const raw = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('jra_session='))?.slice(12) ?? '';
      const session = raw && await store.session(digest(raw));
      if (!session) throw new HttpError(401, '관리자 로그인이 필요합니다.');
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, '세션 확인에 실패했습니다. 다시 로그인하세요.');
      if (path === '/api/admin/session' && req.method === 'GET') return send(200, { csrf: session.csrf, revisionId: (await store.current())?.id ?? 0 });
      if (path === '/api/admin/logout' && req.method === 'POST') { await store.removeSession(digest(raw)); res.setHeader('Set-Cookie', cookie('')); return send(200, { ok: true }); }
      if (path === '/api/admin/history' && req.method === 'GET') return send(200, { revisions: await store.history(), currentId: (await store.current())?.id ?? 0 });
      const revisionId = path.match(/^\/api\/admin\/revisions\/(\d+)$/)?.[1];
      if (revisionId && req.method === 'GET') {
        const revision = await store.revision(Number(revisionId));
        if (!revision) throw new HttpError(404, '게시본을 찾을 수 없습니다.');
        return send(200, { revision });
      }
      if (path === '/api/admin/validate' && req.method === 'POST') {
        const input = await body(req);
        return send(200, { ...validateSchedule(input?.raw), revisionId: (await store.current())?.id ?? 0 });
      }
      if ((path === '/api/admin/publish' || path === '/api/admin/restore') && req.method === 'POST') {
        const input = await body(req);
        if (!Number.isSafeInteger(input?.expectedRevision) || input.expectedRevision < 0) throw new HttpError(400, '검증 후 최신 게시본 번호를 포함하세요.');
        const source = path.endsWith('/restore') ? await store.revision(Number.isSafeInteger(input.revisionId) ? input.revisionId : -1) : null;
        if (path.endsWith('/restore') && !source) throw new HttpError(404, '복원할 게시본을 찾을 수 없습니다.');
        const result = validateSchedule(source ? source.data : input.raw);
        if (!result.ok) return send(422, result);
        if (result.warnings.length && input.confirmWarnings !== true) throw new HttpError(422, '경고를 검토하고 게시 확인을 선택하세요.');
        const publication = await store.publish(result.data, input.expectedRevision, source?.id ?? null);
        return send(200, { publication });
      }
      return send(404, { message: 'API를 찾을 수 없습니다.' });
    } catch (error) {
      const status = error instanceof ConflictError ? 409 : error.status ?? 500;
      if (status === 500) console.error('[ERROR] request_failed');
      if (!res.headersSent) send(status, { message: status === 500 ? '서버 처리에 실패했습니다. 저장소 연결과 서버 로그를 확인하세요.' : error.message });
      else res.end();
    }
  };
  const server = createServer(handler);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { server, handler, store, configured, close: async () => { await new Promise(resolve => server.close(resolve)); await store?.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createApp();
  app.server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => console.log(`Local: ${process.env.APP_ORIGIN ?? 'http://localhost:3000'} (${app.configured ? 'configured' : 'setup required'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
