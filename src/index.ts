import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { bearerAuth } from './middleware/auth.js';
import { appendFragment, getFragments, clearFragments, getStaleProjects, clearActivity } from './db/buffer.js';
import { createEntry, getRecentEntries } from './db/entries.js';
import { ensureProject } from './db/state.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST; // undefined = localhost only, set to '0.0.0.0' for container/cloud

const app = express();
app.use(express.json());

// Stateless MCP endpoint — new server + transport per request
app.post('/mcp', bearerAuth, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('close', () => {
    transport.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Buffer endpoints — behind auth, not MCP tools
app.post('/buffer/:project_id', bearerAuth, (req, res) => {
  const { project_id } = req.params;
  const { fragment } = req.body;
  if (!fragment || typeof fragment !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "fragment" string in body' });
    return;
  }
  const name = project_id.split('/').pop() ?? project_id;
  ensureProject(project_id, name);
  appendFragment(project_id, fragment);
  res.json({ status: 'buffered' });
});

app.post('/flush/:project_id', bearerAuth, (req, res) => {
  const { project_id } = req.params;
  const fragments = getFragments(project_id);
  if (fragments.length === 0) {
    res.json({ status: 'empty' });
    return;
  }

  const body = fragments.map(f => f.fragment).join('\n\n');
  const entry_id = createEntry({
    project_id,
    title: `Buffer flush (${fragments.length} fragments)`,
    source_tool: 'git-hook',
    tags: ['buffer-flush'],
    type: 'session',
    sections: { context: body },
  });
  clearFragments(project_id);
  res.json({ status: 'flushed', entry_id });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'noosphere' });
});

// Session-end auto-push safety net (opt-in via env var)
const IDLE_CHECK_INTERVAL = 5 * 60 * 1000; // check every 5 minutes
const IDLE_THRESHOLD_MINUTES = 30;

if (process.env.NOOSPHERE_AUTO_PUSH === 'true') {
  setInterval(() => {
    const stale = getStaleProjects(IDLE_THRESHOLD_MINUTES);
    for (const { projectId, idleMinutes } of stale) {
      // Only create marker if the most recent entry is older than the activity window
      const recent = getRecentEntries(projectId, 1);
      const lastEntryTime = recent.length > 0 ? new Date(recent[0].timestamp).getTime() : 0;
      const activityWindowStart = Date.now() - (idleMinutes + IDLE_THRESHOLD_MINUTES) * 60 * 1000;

      if (lastEntryTime < activityWindowStart) {
        createEntry({
          project_id: projectId,
          title: 'Session ended without explicit push',
          source_tool: 'auto-push',
          tags: ['auto-push', 'safety-net'],
          type: 'session',
          sections: {
            warning: `This project had tool activity but no push for ${idleMinutes} minutes. The session may have ended without saving context.`,
          },
        });
      }
      clearActivity(projectId);
    }
  }, IDLE_CHECK_INTERVAL);
  console.log('Auto-push safety net enabled (NOOSPHERE_AUTO_PUSH=true)');
}

const listenArgs: [number, ...any[]] = HOST
  ? [PORT, HOST, () => {
      console.log(`Noosphere MCP server listening on http://${HOST}:${PORT}`);
      console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
    }]
  : [PORT, () => {
      console.log(`Noosphere MCP server listening on http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    }];

app.listen(...listenArgs);
