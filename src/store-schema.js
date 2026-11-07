export class ConflictError extends Error {}
export const storeSchema = `
    CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, published_at TEXT NOT NULL, kind TEXT NOT NULL, restored_from INTEGER);
    CREATE TABLE IF NOT EXISTS publication(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision_id INTEGER NOT NULL REFERENCES revisions(id));
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);`;
