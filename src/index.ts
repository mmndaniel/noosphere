import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { appendFragment, getFragments, clearFragments, getStaleProjects, clearActivity, verifyProjectOwnership } from './db/buffer.js';
import { createEntry, getRecentEntries } from './db/entries.js';
import { ensureProject } from './db/state.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST; // undefined = localhost only, set to '0.0.0.0' for container/cloud
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const ISSUER_URL = process.env.ISSUER_URL ?? 'https://usenoosphere.ai';

const app = express();
app.set('trust proxy', 1);

// --- OAuth setup (shared provider instance) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oauthProvider: any;

if (AUTH0_DOMAIN) {
  const { mcpAuthRouter } = await import('@modelcontextprotocol/sdk/server/auth/router.js');
  const { createAuth0Provider } = await import('./auth/provider.js');

  oauthProvider = createAuth0Provider();

  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(ISSUER_URL),
    baseUrl: new URL(ISSUER_URL),
    resourceServerUrl: new URL(`${ISSUER_URL}/mcp`),
    resourceName: 'Noosphere',
  }));

  // Callback intermediary: Auth0 redirects here, we forward to Claude Code's localhost
  app.get('/auth/callback', (req, res) => {
    const { code, state: serverState } = req.query;
    if (!serverState || typeof serverState !== 'string') {
      res.status(400).send('Missing state parameter');
      return;
    }

    const pending = oauthProvider.pendingAuths.get(serverState);
    if (!pending) {
      res.status(400).send('Unknown or expired auth state');
      return;
    }
    oauthProvider.pendingAuths.delete(serverState);

    const target = new URL(pending.originalRedirectUri);
    if (code) target.searchParams.set('code', code as string);
    if (pending.originalState) target.searchParams.set('state', pending.originalState);

    res.redirect(target.toString());
  });

  console.log(`OAuth enabled (Auth0 domain: ${AUTH0_DOMAIN})`);
}

app.use(express.json());

// --- Build auth middleware ---
const authMiddleware = AUTH0_DOMAIN
  ? createAuthMiddleware(oauthProvider!, `${ISSUER_URL}/.well-known/oauth-protected-resource/mcp`)
  : createAuthMiddleware();

/** Extract userId from req.auth, defaulting to 'local' */
function getUserId(req: express.Request): string {
  return (req.auth?.extra?.userId as string) ?? 'local';
}

// Stateless MCP endpoint — new server + transport per request
app.post('/mcp', authMiddleware, async (req, res) => {
  const userId = getUserId(req);
  const server = createMcpServer(userId);
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
app.post('/buffer/:project_id', authMiddleware, (req, res) => {
  const { project_id } = req.params;
  const userId = getUserId(req);
  const { fragment } = req.body;
  if (!fragment || typeof fragment !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "fragment" string in body' });
    return;
  }
  const name = project_id.split('/').pop() ?? project_id;
  ensureProject(project_id, name, userId);
  appendFragment(project_id, fragment);
  res.json({ status: 'buffered' });
});

app.post('/flush/:project_id', authMiddleware, (req, res) => {
  const { project_id } = req.params;
  const userId = getUserId(req);

  // Verify ownership before flushing
  if (!verifyProjectOwnership(project_id, userId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

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
