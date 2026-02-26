import { z } from 'zod';
import { getEntry, entryToMarkdown, extractSection } from '../db/entries.js';

export const ReadInputSchema = z.object({
  entry_id: z.string(),
  section: z.string().optional(),
});

export type ReadInput = z.infer<typeof ReadInputSchema>;

export function read(input: ReadInput, userId: string): string {
  const entry = getEntry(input.entry_id, userId);
  if (!entry) {
    return `Entry "${input.entry_id}" not found.`;
  }

  if (input.section) {
    const sectionContent = extractSection(entry.content, input.section);
    if (sectionContent === null) {
      return `Section "${input.section}" not found in entry "${input.entry_id}".`;
    }
    return `## ${input.section}\n${sectionContent}`;
  }

  return entryToMarkdown(entry);
}
