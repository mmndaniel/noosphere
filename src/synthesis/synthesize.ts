import type { Entry } from '../db/entries.js';

function leadParagraph(content: string): string {
  // Extract first non-heading paragraph, truncated to ~200 chars
  const lines = content.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
  const lead = lines.slice(0, 3).join(' ').trim();
  if (lead.length > 200) return lead.slice(0, 197) + '...';
  return lead;
}

function formatEntry(e: Entry): string {
  const d = new Date(e.timestamp);
  const ts = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `- **${e.title}** (*${ts}*) — ${leadParagraph(e.content)}`;
}

export function synthesizeBrowse(stateMarkdown: string, entries: Entry[]): string {
  const sections: string[] = [stateMarkdown];

  if (entries.length > 0) {
    sections.push('## Recent Entries\n');
    for (const entry of entries) {
      sections.push(formatEntry(entry));
    }
    sections.push('');
  } else {
    sections.push('\n*No entries yet. Save something to record your first entry.*');
  }

  return sections.join('\n');
}
