import { getDb } from './connection.js';

export function verifyProjectOwnership(projectId: string, userId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM projects WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
  return !!row;
}
