import type { Entry } from '../db/entries.js';
import { classifyContent, type ContentClass } from './classify.js';

interface ClassifiedEntry {
  entry: Entry;
  classification: ContentClass;
}

function leadParagraph(content: string): string {
  // Extract first non-heading paragraph, truncated to ~200 chars
  const lines = content.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
  const lead = lines.slice(0, 3).join(' ').trim();
  if (lead.length > 200) return lead.slice(0, 197) + '...';
  return lead;
}

function formatEntry(e: Entry, lead: string): string {
  const ts = e.timestamp.slice(0, 16).replace('T', ' ');
  return `- **${e.title}** (*${e.type} · ${ts}*) — ${lead}  \n  → \`read ${e.entry_id}\``;
}

export function synthesizeBrowse(stateMarkdown: string, entries: Entry[]): string {
  const classified: ClassifiedEntry[] = entries.map(entry => ({
    entry,
    classification: classifyContent(entry.content),
  }));

  const decisions = classified.filter(c => c.classification === 'decision');
  const active = classified.filter(c => c.classification === 'active');
  const speculative = classified.filter(c => c.classification === 'speculative');
  const informational = classified.filter(c => c.classification === 'informational');

  const sections: string[] = [stateMarkdown];

  if (decisions.length > 0) {
    sections.push('## Key Decisions\n');
    for (const { entry } of decisions) {
      sections.push(formatEntry(entry, leadParagraph(entry.content)));
    }
    sections.push('');
  }

  if (active.length > 0) {
    sections.push('## Recent Activity\n');
    for (const { entry } of active) {
      sections.push(formatEntry(entry, leadParagraph(entry.content)));
    }
    sections.push('');
  }

  if (speculative.length > 0) {
    sections.push('## Under Consideration\n');
    for (const { entry } of speculative) {
      sections.push(formatEntry(entry, leadParagraph(entry.content)));
    }
    sections.push('');
  }

  if (informational.length > 0) {
    sections.push('## Other Entries\n');
    for (const { entry } of informational) {
      sections.push(formatEntry(entry, leadParagraph(entry.content)));
    }
    sections.push('');
  }

  // If no entries at all, note that
  if (entries.length === 0) {
    sections.push('\n*No entries yet. Use `push` to record your first entry.*');
  }

  return sections.join('\n');
}
