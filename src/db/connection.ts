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
      project_id TEXT NOT NULL,
      user_id    TEXT NOT NULL DEFAULT 'local',
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      PRIMARY KEY (project_id, user_id)
    );

    -- Atomic key-value fields for the living project state document
    -- is_list_item=0: "- key: value" rendering
    -- is_list_item=1: "- value" rendering (list append)
    CREATE TABLE IF NOT EXISTS project_state_fields (
      project_id   TEXT    NOT NULL,
      user_id      TEXT    NOT NULL DEFAULT 'local',
      section      TEXT    NOT NULL,
      key          TEXT    NOT NULL,
      value        TEXT    NOT NULL,
      is_list_item INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT    NOT NULL,
      PRIMARY KEY (project_id, user_id, section, key)
    );

    CREATE TABLE IF NOT EXISTS entries (
      entry_id    TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      user_id     TEXT NOT NULL DEFAULT 'local',
      title       TEXT NOT NULL,
      source_tool TEXT NOT NULL DEFAULT 'unknown',
      timestamp   TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      type        TEXT NOT NULL DEFAULT 'session',
      content     TEXT NOT NULL
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
  // Check if the full migration (FK removal + compound PKs) is complete.
  // The definitive check: entries table DDL should NOT contain a FOREIGN KEY clause.
  const entriesDdl = (db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'"
  ).get() as { sql: string } | undefined)?.sql ?? '';
  const entriesHasFk = entriesDdl.includes('FOREIGN KEY');
  const entryCols = db.pragma('table_info(entries)') as { name: string }[];
  const entriesHasUserId = entryCols.some(c => c.name === 'user_id');

  if (entriesHasUserId && !entriesHasFk) return; // fully migrated

  // Ensure projects has user_id column (from prior migration)
  const projCols = db.pragma('table_info(projects)') as { name: string }[];
  if (!projCols.some(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT`);
    db.exec(`UPDATE projects SET user_id = 'local' WHERE user_id IS NULL`);
  }

  db.pragma('foreign_keys = OFF');

  const migrate = db.transaction(() => {
    // 1. Recreate projects with compound PK (project_id, user_id)
    db.exec(`
      CREATE TABLE projects_new (
        project_id TEXT NOT NULL,
        user_id    TEXT NOT NULL DEFAULT 'local',
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        PRIMARY KEY (project_id, user_id)
      );
      INSERT INTO projects_new (project_id, user_id, name, created_at)
        SELECT project_id, COALESCE(user_id, 'local'), name, created_at FROM projects;
      DROP TABLE projects;
      ALTER TABLE projects_new RENAME TO projects;
    `);

    // 2. Recreate project_state_fields with compound PK including user_id
    const psfCols = db.pragma('table_info(project_state_fields)') as { name: string }[];
    const psfHasUserId = psfCols.some(c => c.name === 'user_id');

    db.exec(`
      CREATE TABLE project_state_fields_new (
        project_id   TEXT    NOT NULL,
        user_id      TEXT    NOT NULL DEFAULT 'local',
        section      TEXT    NOT NULL,
        key          TEXT    NOT NULL,
        value        TEXT    NOT NULL,
        is_list_item INTEGER NOT NULL DEFAULT 0,
        updated_at   TEXT    NOT NULL,
        PRIMARY KEY (project_id, user_id, section, key)
      );
    `);
    // Use existing user_id if column exists, otherwise backfill from projects
    db.exec(psfHasUserId
      ? `INSERT INTO project_state_fields_new (project_id, user_id, section, key, value, is_list_item, updated_at)
           SELECT project_id, user_id, section, key, value, is_list_item, updated_at
           FROM project_state_fields`
      : `INSERT INTO project_state_fields_new (project_id, user_id, section, key, value, is_list_item, updated_at)
           SELECT psf.project_id, COALESCE(p.user_id, 'local'), psf.section, psf.key, psf.value, psf.is_list_item, psf.updated_at
           FROM project_state_fields psf
           LEFT JOIN projects p ON p.project_id = psf.project_id`
    );
    db.exec(`
      DROP TABLE project_state_fields;
      ALTER TABLE project_state_fields_new RENAME TO project_state_fields;
    `);

    // 3. Recreate entries without FK constraint, adding user_id
    //    Must also rebuild FTS table and triggers since they reference entries.
    db.exec(`
      DROP TRIGGER IF EXISTS entries_ai;
      DROP TRIGGER IF EXISTS entries_ad;
      DROP TRIGGER IF EXISTS entries_au;
      DROP TABLE IF EXISTS entries_fts;

      CREATE TABLE entries_new (
        entry_id    TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        user_id     TEXT NOT NULL DEFAULT 'local',
        title       TEXT NOT NULL,
        source_tool TEXT NOT NULL DEFAULT 'unknown',
        timestamp   TEXT NOT NULL,
        tags        TEXT NOT NULL DEFAULT '[]',
        type        TEXT NOT NULL DEFAULT 'session',
        content     TEXT NOT NULL
      );
    `);
    // Use existing user_id if column exists, otherwise backfill from projects
    db.exec(entriesHasUserId
      ? `INSERT INTO entries_new (entry_id, project_id, user_id, title, source_tool, timestamp, tags, type, content)
           SELECT entry_id, project_id, user_id, title, source_tool, timestamp, tags, type, content
           FROM entries`
      : `INSERT INTO entries_new (entry_id, project_id, user_id, title, source_tool, timestamp, tags, type, content)
           SELECT e.entry_id, e.project_id, COALESCE(p.user_id, 'local'), e.title, e.source_tool, e.timestamp, e.tags, e.type, e.content
           FROM entries e
           LEFT JOIN projects p ON p.project_id = e.project_id`
    );
    db.exec(`
      DROP TABLE entries;
      ALTER TABLE entries_new RENAME TO entries;

      CREATE VIRTUAL TABLE entries_fts USING fts5(
        title, content, tags,
        content=entries,
        content_rowid=rowid
      );
      INSERT INTO entries_fts(rowid, title, content, tags)
        SELECT rowid, title, content, tags FROM entries;

      CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, title, content, tags)
          VALUES (new.rowid, new.title, new.content, new.tags);
      END;
      CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
          VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      END;
      CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
          VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO entries_fts(rowid, title, content, tags)
          VALUES (new.rowid, new.title, new.content, new.tags);
      END;
    `);

    // 4. Drop unused buffer_fragments table
    db.exec(`DROP TABLE IF EXISTS buffer_fragments;`);
  });

  migrate();
  db.pragma('foreign_keys = ON');
}
