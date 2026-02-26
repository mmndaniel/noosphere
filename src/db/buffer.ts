import { getDb } from './connection.js';

// --- In-memory activity tracking for auto-push ---

interface ActivityRecord {
  userId: string;
  lastTool: string;
  lastActivity: number; // Date.now()
}

const activityMap = new Map<string, ActivityRecord>();

/** Key for activity map: scoped to user + project */
function activityKey(projectId: string, userId: string): string {
  return `${userId}:${projectId}`;
}

export function recordActivity(projectId: string, userId: string, tool: string): void {
  activityMap.set(activityKey(projectId, userId), { userId, lastTool: tool, lastActivity: Date.now() });
}

export interface StaleProject {
  projectId: string;
  userId: string;
  lastTool: string;
  idleMinutes: number;
}

export function getStaleProjects(idleMinutes: number): StaleProject[] {
  const threshold = Date.now() - idleMinutes * 60 * 1000;
  const stale: StaleProject[] = [];
  for (const [key, record] of activityMap) {
    if (record.lastActivity < threshold) {
      const projectId = key.slice(record.userId.length + 1);
      stale.push({
        projectId,
        userId: record.userId,
        lastTool: record.lastTool,
        idleMinutes: Math.round((Date.now() - record.lastActivity) / 60000),
      });
    }
  }
  return stale;
}

export function clearActivity(projectId: string, userId: string): void {
  activityMap.delete(activityKey(projectId, userId));
}

// --- Persistent buffer fragments ---

export interface BufferFragment {
  id: number;
  project_id: string;
  fragment: string;
  created_at: string;
}

export function verifyProjectOwnership(projectId: string, userId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM projects WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
  return !!row;
}

export function appendFragment(projectId: string, userId: string, fragment: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO buffer_fragments (project_id, user_id, fragment) VALUES (?, ?, ?)'
  ).run(projectId, userId, fragment);
}

export function getFragments(projectId: string, userId: string): BufferFragment[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM buffer_fragments WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC'
  ).all(projectId, userId) as BufferFragment[];
}

export function clearFragments(projectId: string, userId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM buffer_fragments WHERE project_id = ? AND user_id = ?').run(projectId, userId);
}
