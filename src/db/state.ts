import { getDb } from './connection.js';

export interface KeyValueDelta {
  section: string;
  key: string;
  value: string;
}

export interface ListAppendDelta {
  section: string;
  add: string;
}

export type StateDelta = KeyValueDelta | ListAppendDelta;

function isListAppend(delta: StateDelta): delta is ListAppendDelta {
  return 'add' in delta;
}

function rand4(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

export function applyStateDeltas(projectId: string, deltas: StateDelta[]): void {
  const db = getDb();
  const now = new Date().toISOString();

  const upsertField = db.prepare(`
    INSERT INTO project_state_fields (project_id, section, key, value, is_list_item, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, section, key) DO UPDATE SET
      value = excluded.value,
      is_list_item = excluded.is_list_item,
      updated_at = excluded.updated_at
  `);

  const insertListItem = db.prepare(`
    INSERT INTO project_state_fields (project_id, section, key, value, is_list_item, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  const applyAll = db.transaction(() => {
    for (const delta of deltas) {
      if (isListAppend(delta)) {
        const key = `${now}_${rand4()}`;
        insertListItem.run(projectId, delta.section, key, delta.add, now);
      } else {
        upsertField.run(projectId, delta.section, delta.key, delta.value, 0, now);
      }
    }
  });

  applyAll();
}

interface StateField {
  section: string;
  key: string;
  value: string;
  is_list_item: number;
  updated_at: string;
}

const SECTION_ORDER = [
  'Summary',
  'Current Architecture',
  'Active Decisions',
  'Current State',
  'Recent Activity',
  'Continuation Hints',
];

export function reconstructState(projectId: string): string {
  const db = getDb();

  const project = db.prepare(
    'SELECT project_id, name, created_at FROM projects WHERE project_id = ?'
  ).get(projectId) as { project_id: string; name: string; created_at: string } | undefined;

  if (!project) return '';

  const fields = db.prepare(
    'SELECT section, key, value, is_list_item, updated_at FROM project_state_fields WHERE project_id = ? ORDER BY updated_at ASC'
  ).all(projectId) as StateField[];

  // Group fields by section
  const sections = new Map<string, StateField[]>();
  for (const field of fields) {
    if (!sections.has(field.section)) sections.set(field.section, []);
    sections.get(field.section)!.push(field);
  }

  // Get the latest updated_at across all fields
  const lastUpdated = fields.length > 0
    ? fields.reduce((latest, f) => f.updated_at > latest ? f.updated_at : latest, fields[0].updated_at)
    : project.created_at;

  // Build markdown
  const lines: string[] = [];

  lines.push('---');
  lines.push(`project_id: ${project.project_id}`);
  lines.push(`name: ${project.name}`);
  lines.push(`updated: ${lastUpdated}`);
  lines.push('---');
  lines.push('');

  // Ordered sections first
  for (const sectionName of SECTION_ORDER) {
    const sectionFields = sections.get(sectionName);
    if (!sectionFields || sectionFields.length === 0) continue;

    lines.push(`## ${sectionName}`);
    for (const field of sectionFields) {
      if (field.is_list_item) {
        lines.push(`- ${field.value}`);
      } else {
        lines.push(`- ${field.key}: ${field.value}`);
      }
    }
    lines.push('');
    sections.delete(sectionName);
  }

  // Any remaining custom sections alphabetically
  const customSections = [...sections.keys()].sort();
  for (const sectionName of customSections) {
    const sectionFields = sections.get(sectionName)!;
    if (sectionFields.length === 0) continue;

    lines.push(`## ${sectionName}`);
    for (const field of sectionFields) {
      if (field.is_list_item) {
        lines.push(`- ${field.value}`);
      } else {
        lines.push(`- ${field.key}: ${field.value}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  summary: string;
  last_activity: string;
  entry_count: number;
}

export function listAllProjects(): ProjectSummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      p.project_id,
      p.name,
      p.created_at,
      COUNT(e.entry_id) AS entry_count,
      MAX(e.timestamp) AS last_activity
    FROM projects p
    LEFT JOIN entries e ON e.project_id = p.project_id
    GROUP BY p.project_id
    ORDER BY COALESCE(MAX(e.timestamp), p.created_at) DESC
  `).all() as {
    project_id: string;
    name: string;
    created_at: string;
    entry_count: number;
    last_activity: string | null;
  }[];

  return rows.map(row => {
    // Get Summary field if it exists
    const summaryField = db.prepare(`
      SELECT value FROM project_state_fields
      WHERE project_id = ? AND section = 'Summary'
      ORDER BY updated_at DESC LIMIT 1
    `).get(row.project_id) as { value: string } | undefined;

    return {
      project_id: row.project_id,
      name: row.name,
      summary: summaryField?.value ?? '',
      last_activity: row.last_activity ?? row.created_at,
      entry_count: row.entry_count,
    };
  });
}

export function ensureProject(projectId: string, name: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO projects (project_id, name)
    VALUES (?, ?)
    ON CONFLICT(project_id) DO NOTHING
  `).run(projectId, name);
}
