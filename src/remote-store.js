import { createClient } from '@libsql/client/http';
import { storeSchema, ConflictError } from './store-schema.js';

const decode = row => row ? ({ id: Number(row.id), data: JSON.parse(row.payload), publishedAt: row.published_at, kind: row.kind, restoredFrom: row.restored_from === null ? null : Number(row.restored_from) }) : null;
const currentSql = 'SELECT r.* FROM revisions r JOIN publication p ON p.revision_id=r.id WHERE p.singleton=1';

// HTTP transport needs no persistent connection or writable function filesystem.
export function openRemoteStore(config, client) {
  if (!client) {
    const url = new URL(config.TURSO_DATABASE_URL);
    if (!['libsql:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Turso HTTPS/libsql URL이 필요합니다.');
    client = createClient({ url: url.href, authToken: config.TURSO_AUTH_TOKEN });
  }
  let initialization;
  const ready = () => initialization ??= client.executeMultiple(storeSchema).catch(error => { initialization = undefined; throw error; });
  const execute = async (sql, args = []) => { await ready(); return client.execute({ sql, args }); };
  return {
    ready, close: () => client.close(),
    current: async () => decode((await execute(currentSql)).rows[0]),
    revision: async id => decode((await execute('SELECT * FROM revisions WHERE id=?', [id])).rows[0]),
    history: async () => (await execute('SELECT id,published_at,kind,restored_from FROM revisions ORDER BY id DESC LIMIT 100')).rows.map(r => ({ id: Number(r.id), publishedAt: r.published_at, kind: r.kind, restoredFrom: r.restored_from === null ? null : Number(r.restored_from) })),
    async publish(data, expectedRevision, restoredFrom = null) {
      await ready();
      let tx;
      try {
        tx = await client.transaction('write');
        const previous = decode((await tx.execute(currentSql)).rows[0]);
        if ((previous?.id ?? 0) !== expectedRevision) throw new ConflictError('다른 게시가 먼저 반영되었습니다. 최신 공개본을 확인하고 다시 검증하세요.');
        const publishedAt = new Date().toISOString();
        const kind = restoredFrom ? 'restore' : 'publish';
        const inserted = await tx.execute({ sql: 'INSERT INTO revisions(payload,published_at,kind,restored_from) VALUES(?,?,?,?)', args: [JSON.stringify(data), publishedAt, kind, restoredFrom] });
        const id = Number(inserted.lastInsertRowid);
        await tx.execute({ sql: 'INSERT INTO publication VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET revision_id=excluded.revision_id', args: [id] });
        await tx.commit();
        return { id, data, publishedAt, kind, restoredFrom };
      } catch (error) {
        if (tx && !tx.closed) await tx.rollback();
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_BUSY_SNAPSHOT') throw new ConflictError('다른 쓰기 작업이 진행 중입니다. 최신 공개본을 확인하고 다시 검증하세요.');
        throw error;
      } finally { tx?.close(); }
    },
    session: async hash => (await execute('SELECT csrf,expires_at FROM sessions WHERE hash=? AND expires_at>?', [hash, Date.now()])).rows[0],
    async addSession(hash, csrf) {
      await execute('DELETE FROM sessions WHERE expires_at<=?', [Date.now()]);
      await execute('INSERT INTO sessions VALUES(?,?,?)', [hash, csrf, Date.now() + 8 * 60 * 60_000]);
    },
    removeSession: hash => execute('DELETE FROM sessions WHERE hash=?', [hash]),
    limited: async key => Number((await execute('SELECT count FROM login_limits WHERE key=? AND resets_at>?', [key, Date.now()])).rows[0]?.count ?? 0) >= 5,
    failedLogin: key => execute(`INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,
      resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END`, [key, Date.now() + 15 * 60_000, Date.now(), Date.now()]),
    clearLimit: key => execute('DELETE FROM login_limits WHERE key=?', [key]),
  };
}
