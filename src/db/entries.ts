import { getDb } from './connection.js';

export interface Entry {
  entry_id: string;
  project_id: string;
  title: string;
  source_tool: string;
  timestamp: string;
  tags: string[];
  type: string;
  content: string;
}

export interface SearchResult {
  entry_id: string;
  title: string;
  snippet: string;
  source_tool: string;
  timestamp: string;
  tags: string[];
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
  title: string;
  source_tool?: string;
  tags?: string[];
  type?: string;
  sections: Record<string, string>;
}): string {
  const db = getDb();
  const entry_id = generateEntryId();
  const timestamp = new Date().toISOString();
  const tags = JSON.stringify(params.tags ?? []);
  const content = sectionsToMarkdown(params.sections);

  db.prepare(`
    INSERT INTO entries (entry_id, project_id, title, source_tool, timestamp, tags, type, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry_id,
    params.project_id,
    params.title,
    params.source_tool ?? 'unknown',
    timestamp,
    tags,
    params.type ?? 'session',
    content,
  );

  return entry_id;
}

export function getEntry(entryId: string): Entry | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM entries WHERE entry_id = ?'
  ).get(entryId) as (Omit<Entry, 'tags'> & { tags: string }) | undefined;

  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags) };
}

export function entryToMarkdown(entry: Entry): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`entry_id: ${entry.entry_id}`);
  lines.push(`project_id: ${entry.project_id}`);
  lines.push(`title: ${entry.title}`);
  lines.push(`source_tool: ${entry.source_tool}`);
  lines.push(`timestamp: ${entry.timestamp}`);
  lines.push(`tags: [${entry.tags.join(', ')}]`);
  lines.push(`type: ${entry.type}`);
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

export function getRecentEntries(projectId: string, limit = 5): Entry[] {
  const db = getDb();

  // Foundational entries first, then most recent session entries, capped at limit
  const rows = db.prepare(`
    SELECT * FROM entries
    WHERE project_id = ?
    ORDER BY
      CASE WHEN type = 'foundational' THEN 0 ELSE 1 END ASC,
      timestamp DESC
    LIMIT ?
  `).all(projectId, limit) as (Omit<Entry, 'tags'> & { tags: string })[];

  return rows.map(row => ({ ...row, tags: JSON.parse(row.tags) }));
}

export function getEntryCount(projectId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS count FROM entries WHERE project_id = ?'
  ).get(projectId) as { count: number };
  return row.count;
}

export function searchEntries(projectId: string, keywords: string[]): SearchResult[] {
  const db = getDb();

  if (keywords.length === 0) return [];

  // Build FTS5 query: "auth" OR "jwt" OR "login"
  const ftsQuery = keywords.map(k => `"${k.replace(/"/g, '')}"`).join(' OR ');

  const rows = db.prepare(`
    SELECT
      e.entry_id,
      e.title,
      snippet(entries_fts, 1, '[', ']', '...', 32) AS snippet,
      e.source_tool,
      e.timestamp,
      e.tags
    FROM entries_fts
    JOIN entries e ON e.rowid = entries_fts.rowid
    WHERE entries_fts MATCH ?
      AND e.project_id = ?
    ORDER BY rank
    LIMIT 20
  `).all(ftsQuery, projectId) as {
    entry_id: string;
    title: string;
    snippet: string;
    source_tool: string;
    timestamp: string;
    tags: string;
  }[];

  return rows.map(row => ({
    entry_id: row.entry_id,
    title: row.title,
    snippet: row.snippet,
    source_tool: row.source_tool,
    timestamp: row.timestamp,
    tags: JSON.parse(row.tags),
  }));
}
