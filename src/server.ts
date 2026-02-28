import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowseInputSchema, browse } from './tools/browse.js';
import { SearchInputSchema, search } from './tools/search.js';
import { ReadInputSchema, read } from './tools/read.js';
import { SaveInputSchema, save } from './tools/save.js';

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer(
    {
      name: 'noosphere',
      version: '0.1.0',
    },
    {
      instructions: `Noosphere is persistent working memory across AI tools and sessions. It stores context so users don't have to re-explain themselves.

When to use it:
- At session start: call browse to load the user's current project state and pick up where they left off.
- During work: call save when the user makes a decision, reaches a milestone, or changes direction.
- At session end: call save to capture where things stand so the next session (in any tool) can continue.
- When the user asks to recall something: call search to find it in the project history, then read to get the full entry.

The user doesn't need to ask you to use Noosphere. Use it automatically — browse at the start, save at natural checkpoints.

Note: In voice/speech-to-text input, "Noosphere" is often transcribed as "new sphere", "no sphere", or similar. Treat these as references to this tool.`,
    }
  );

  server.tool(
    'browse',
    'Start here. Returns a list of all projects, or the full project context for a specific project including current state, recent activity, and next steps.',
    BrowseInputSchema.shape,
    async (input) => {
      const typed = input as Parameters<typeof browse>[0];
      const result = browse(typed, userId);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'search',
    "Search project history. Pass an array of related keywords for best results — e.g., ['auth', 'authentication', 'login', 'JWT'] instead of just 'auth'.",
    SearchInputSchema.shape,
    async (input) => {
      const typed = input as Parameters<typeof search>[0];
      const result = search(typed, userId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'read',
    'Read a full entry or a specific section. Use after finding entries via search.',
    ReadInputSchema.shape,
    async (input) => {
      const result = read(input as Parameters<typeof read>[0], userId);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'save',
    'Save a work summary, decision, or project state update. Call at natural checkpoints and at session end.',
    SaveInputSchema.shape,
    async (input) => {
      const typed = input as Parameters<typeof save>[0];
      const result = save(typed, userId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
