import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../data/noosphere.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Atomic key-value fields for the living project state document
    -- is_list_item=0: "- key: value" rendering
    -- is_list_item=1: "- value" rendering (list append)
    CREATE TABLE IF NOT EXISTS project_state_fields (
      project_id   TEXT    NOT NULL,
      section      TEXT    NOT NULL,
      key          TEXT    NOT NULL,
      value        TEXT    NOT NULL,
      is_list_item INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT    NOT NULL,
      PRIMARY KEY (project_id, section, key),
      FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    CREATE TABLE IF NOT EXISTS entries (
      entry_id    TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      source_tool TEXT NOT NULL DEFAULT 'unknown',
      timestamp   TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      type        TEXT NOT NULL DEFAULT 'session',
      content     TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    -- FTS5 content table (linked to entries via rowid)
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      title, content, tags,
      content=entries,
      content_rowid=rowid
    );

    -- Keep FTS5 in sync
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      INSERT INTO entries_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
    END;

    CREATE TABLE IF NOT EXISTS buffer_fragments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      fragment   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id    TEXT PRIMARY KEY,
      email      TEXT,
      name       TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_seen  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id                TEXT PRIMARY KEY,
      client_secret            TEXT,
      client_id_issued_at      INTEGER,
      client_secret_expires_at INTEGER,
      redirect_uris            TEXT NOT NULL,
      client_name              TEXT,
      client_uri               TEXT,
      grant_types              TEXT,
      response_types           TEXT,
      token_endpoint_auth_method TEXT,
      scope                    TEXT,
      created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);

  migrateSchema(db);
}

function migrateSchema(db: Database.Database): void {
  const cols = db.pragma('table_info(projects)') as { name: string }[];
  if (!cols.some(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT`);
    db.exec(`UPDATE projects SET user_id = 'local' WHERE user_id IS NULL`);
  }
}
