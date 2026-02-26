import { getDb } from './connection.js';

export function ensureUser(userId: string, email?: string, name?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (user_id, email, name)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = COALESCE(excluded.email, users.email),
      name = COALESCE(excluded.name, users.name),
      last_seen = strftime('%Y-%m-%dT%H:%M:%SZ','now')
  `).run(userId, email ?? null, name ?? null);
}
