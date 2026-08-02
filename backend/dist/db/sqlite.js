import Database from 'better-sqlite3';
export function createDatabase(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL,
      record_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (store, record_key)
    );
  `);
    return db;
}
