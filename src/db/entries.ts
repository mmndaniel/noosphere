import { getDb } from './connection.js';

export interface Entry {
  entry_id: string;
  project_id: string;
  title: string;
  timestamp: string;
  content: string;
}

export interface SearchResult {
  entry_id: string;
  title: string;
  snippet: string;
  timestamp: string;
}

function generateEntryId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `e_${date}_${time}_${rand}`;
}

export function createEntry(params: {
  project_id: string;
  user_id: string;
  title: string;
  sections: Record<string, string>;
}): string {
  const db = getDb();
  const entry_id = generateEntryId();
  const timestamp = new Date().toISOString();
  const content = sectionsToMarkdown(params.sections);

  db.prepare(`
    INSERT INTO entries (entry_id, project_id, user_id, title, timestamp, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry_id,
    params.project_id,
    params.user_id,
    params.title,
    timestamp,
    content,
  );

  return entry_id;
}

export function getEntry(entryId: string, userId: string): Entry | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM entries
    WHERE entry_id = ? AND user_id = ?
  `).get(entryId, userId) as Entry | undefined;

  return row ?? null;
}

export function entryToMarkdown(entry: Entry): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: ${entry.title}`);
  lines.push(`timestamp: ${entry.timestamp}`);
  lines.push('---');
  lines.push('');
  lines.push(entry.content);
  return lines.join('\n');
}

export function extractSection(content: string, section: string): string | null {
  // Regex: ## SectionName\n(content until next ## or end)
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = re.exec(content);
  if (!match) return null;
  return match[1].trim();
}

function sectionsToMarkdown(sections: Record<string, string>): string {
  return Object.entries(sections)
    .map(([heading, body]) => `## ${heading}\n${body}`)
    .join('\n\n');
}

export function getRecentEntries(projectId: string, limit: number, userId: string): Entry[] {
  const db = getDb();

  return db.prepare(`
    SELECT * FROM entries
    WHERE project_id = ? AND user_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(projectId, userId, limit) as Entry[];
}

export function getEntryCount(projectId: string, userId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS count FROM entries WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId) as { count: number };
  return row.count;
}

export function searchEntries(projectId: string, keywords: string[], userId: string): SearchResult[] {
  const db = getDb();

  if (keywords.length === 0) return [];

  // Build FTS5 query: "auth" OR "jwt" OR "login"
  const ftsQuery = keywords.map(k => `"${k.replace(/"/g, '')}"`).join(' OR ');

  return db.prepare(`
    SELECT
      e.entry_id,
      e.title,
      snippet(entries_fts, 1, '[', ']', '...', 32) AS snippet,
      e.timestamp
    FROM entries_fts
    JOIN entries e ON e.rowid = entries_fts.rowid
    WHERE entries_fts MATCH ?
      AND e.project_id = ?
      AND e.user_id = ?
    ORDER BY rank
    LIMIT 20
  `).all(ftsQuery, projectId, userId) as SearchResult[];
}
