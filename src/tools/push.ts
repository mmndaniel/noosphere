import { z } from 'zod';
import { createEntry } from '../db/entries.js';
import { applyStateDeltas, ensureProject } from '../db/state.js';

const KeyValueDeltaSchema = z.object({
  section: z.string(),
  key: z.string(),
  value: z.string(),
});

const ListAppendDeltaSchema = z.object({
  section: z.string(),
  add: z.string(),
});

const StateDeltaSchema = z.union([KeyValueDeltaSchema, ListAppendDeltaSchema]);

export const PushInputSchema = z.object({
  project_id: z.string(),
  // Entry fields (all optional — can push state only)
  title: z.string().optional(),
  type: z.enum(['session', 'foundational']).optional(),
  source_tool: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sections: z.record(z.string(), z.string()).optional(),
  // State update (optional — can push entry only)
  state_deltas: z.array(StateDeltaSchema).optional(),
});

export type PushInput = z.infer<typeof PushInputSchema>;

export function push(input: PushInput, userId: string): object {
  // Derive project name: last segment of the project_id or the full string
  const name = input.project_id.split('/').pop() ?? input.project_id;
  ensureProject(input.project_id, name, userId);

  const result: Record<string, string> = {};

  // Write entry if title + sections provided
  if (input.title && input.sections) {
    const entry_id = createEntry({
      project_id: input.project_id,
      user_id: userId,
      title: input.title,
      source_tool: input.source_tool,
      tags: input.tags,
      type: input.type,
      sections: input.sections,
    });
    result.entry_id = entry_id;
    result.entry_status = 'created';
  }

  // Apply state deltas if provided
  if (input.state_deltas && input.state_deltas.length > 0) {
    applyStateDeltas(input.project_id, userId, input.state_deltas);
    result.state_status = 'updated';
  }

  if (Object.keys(result).length === 0) {
    return { status: 'noop', message: 'No entry or state_deltas provided.' };
  }

  return result;
}
