import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowseInputSchema, browse } from './tools/browse.js';
import { SearchInputSchema, search } from './tools/search.js';
import { ReadInputSchema, read } from './tools/read.js';
import { PushInputSchema, push } from './tools/push.js';

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: 'noosphere',
    version: '0.1.0',
  });

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
    'push',
    'Save a work summary, decision, or project state update. Call at natural checkpoints and at session end.',
    PushInputSchema.shape,
    async (input) => {
      const typed = input as Parameters<typeof push>[0];
      const result = push(typed, userId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
