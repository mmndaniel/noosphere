import { z } from 'zod';
import { searchEntries } from '../db/entries.js';

export const SearchInputSchema = z.object({
  project_id: z.string(),
  query: z.array(z.string()).min(1),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export function search(input: SearchInput): object {
  const results = searchEntries(input.project_id, input.query);
  return { results };
}
