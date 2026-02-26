import { getDb } from './connection.js';

// --- In-memory activity tracking for auto-push ---

interface ActivityRecord {
  lastTool: string;
  lastActivity: number; // Date.now()
}

const activityMap = new Map<string, ActivityRecord>();

export function recordActivity(projectId: string, tool: string): void {
  activityMap.set(projectId, { lastTool: tool, lastActivity: Date.now() });
}

export interface StaleProject {
  projectId: string;
  lastTool: string;
  idleMinutes: number;
}

export function getStaleProjects(idleMinutes: number): StaleProject[] {
  const threshold = Date.now() - idleMinutes * 60 * 1000;
  const stale: StaleProject[] = [];
  for (const [projectId, record] of activityMap) {
    if (record.lastActivity < threshold) {
      stale.push({
        projectId,
        lastTool: record.lastTool,
        idleMinutes: Math.round((Date.now() - record.lastActivity) / 60000),
      });
    }
  }
  return stale;
}

export function clearActivity(projectId: string): void {
  activityMap.delete(projectId);
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

export function appendFragment(projectId: string, fragment: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO buffer_fragments (project_id, fragment) VALUES (?, ?)'
  ).run(projectId, fragment);
}

export function getFragments(projectId: string): BufferFragment[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM buffer_fragments WHERE project_id = ? ORDER BY created_at ASC'
  ).all(projectId) as BufferFragment[];
}

export function clearFragments(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM buffer_fragments WHERE project_id = ?').run(projectId);
}
