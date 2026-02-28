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

const RemoveDeltaSchema = z.object({
  section: z.string(),
  remove: z.string(),
});

const StateDeltaSchema = z.union([KeyValueDeltaSchema, ListAppendDeltaSchema, RemoveDeltaSchema]);

export const SaveInputSchema = z.object({
  project_id: z.string(),
  title: z.string().optional(),
  sections: z.record(z.string(), z.string()).optional(),
  state_deltas: z.array(StateDeltaSchema).optional(),
});

export type SaveInput = z.infer<typeof SaveInputSchema>;

export function save(input: SaveInput, userId: string): object {
  ensureProject(input.project_id, userId);

  const result: Record<string, string> = {};

  // Write entry if title + sections provided
  if (input.title && input.sections) {
    const entry_id = createEntry({
      project_id: input.project_id,
      user_id: userId,
      title: input.title,
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
