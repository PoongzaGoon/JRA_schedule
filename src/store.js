import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export class ConflictError extends Error {}
export function openStore(filename) {
  if (filename === ':memory:') throw new Error('영속 데이터베이스 경로를 설정하세요.');
  mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, published_at TEXT NOT NULL, kind TEXT NOT NULL, restored_from INTEGER);
    CREATE TABLE IF NOT EXISTS publication(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision_id INTEGER NOT NULL REFERENCES revisions(id));
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);`);
  const current = () => {
    const row = db.prepare('SELECT r.* FROM revisions r JOIN publication p ON p.revision_id=r.id WHERE p.singleton=1').get();
    return row ? decode(row) : null;
  };
  const decode = row => ({ id: row.id, data: JSON.parse(row.payload), publishedAt: row.published_at, kind: row.kind, restoredFrom: row.restored_from });
  return {
    close: () => db.close(), current,
    history: () => db.prepare('SELECT id,published_at,kind,restored_from FROM revisions ORDER BY id DESC LIMIT 100').all().map(r => ({ id: r.id, publishedAt: r.published_at, kind: r.kind, restoredFrom: r.restored_from })),
    revision: id => { const row = db.prepare('SELECT * FROM revisions WHERE id=?').get(id); return row ? decode(row) : null; },
    publish(data, expectedRevision, restoredFrom = null) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if ((current()?.id ?? 0) !== expectedRevision) throw new ConflictError('다른 게시가 먼저 반영되었습니다. 최신 공개본을 확인하고 다시 검증하세요.');
        const timestamp = new Date().toISOString();
        const insert = db.prepare('INSERT INTO revisions(payload,published_at,kind,restored_from) VALUES(?,?,?,?)').run(JSON.stringify(data), timestamp, restoredFrom ? 'restore' : 'publish', restoredFrom);
        const id = Number(insert.lastInsertRowid);
        db.prepare('INSERT INTO publication VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET revision_id=excluded.revision_id').run(id);
        db.exec('COMMIT');
        return current();
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    session(hash) { return db.prepare('SELECT csrf,expires_at FROM sessions WHERE hash=? AND expires_at>?').get(hash, Date.now()); },
    addSession(hash, csrf) {
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, csrf, Date.now() + 8 * 60 * 60_000);
    },
    removeSession(hash) { db.prepare('DELETE FROM sessions WHERE hash=?').run(hash); },
    limited(key) {
      db.prepare('DELETE FROM login_limits WHERE resets_at<=?').run(Date.now());
      return (db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count ?? 0) >= 5;
    },
    failedLogin(key) { db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, Date.now() + 15 * 60_000); },
    clearLimit(key) { db.prepare('DELETE FROM login_limits WHERE key=?').run(key); },
  };
}
