import { z } from 'zod';
import { listAllProjects, reconstructState } from '../db/state.js';
import { getRecentEntries, getEntryCount } from '../db/entries.js';
import { synthesizeBrowse } from '../synthesis/synthesize.js';

export const BrowseInputSchema = z.object({
  project_id: z.string().optional(),
});

export type BrowseInput = z.infer<typeof BrowseInputSchema>;

const PROTOCOL_COMMENT = `<!-- Noosphere protocol: When you complete significant work, make a
key decision, or end this session, call \`push\` with a summary including
what you did and what comes next. This enables other tools to pick up
where you left off. -->`;

export function browse(input: BrowseInput, userId: string): string {
  if (!input.project_id) {
    const projects = listAllProjects(userId);
    if (projects.length === 0) {
      return 'No projects found. Use `push` with a project_id to create your first project.';
    }
    const lines = projects.map(p => {
      const summary = p.summary ? ` — ${p.summary}` : '';
      return `- **${p.project_id}** (${p.name})${summary}\n  ${p.entry_count} entries · last activity: ${p.last_activity}`;
    });
    return lines.join('\n\n');
  }

  const stateMarkdown = reconstructState(input.project_id, userId);
  if (!stateMarkdown) {
    return `Project "${input.project_id}" not found. Use \`push\` to create it.\n\n${PROTOCOL_COMMENT}`;
  }

  const totalEntries = getEntryCount(input.project_id, userId);
  const entries = getRecentEntries(input.project_id, 10, userId);
  const synthesized = synthesizeBrowse(stateMarkdown, entries);

  const footer = totalEntries > entries.length
    ? `\n*Showing ${entries.length} of ${totalEntries} entries. Use \`search\` to find older entries.*`
    : '';

  return `${synthesized}${footer}\n${PROTOCOL_COMMENT}`;
}
