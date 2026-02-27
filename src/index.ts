import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { createAuthMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Homepage — serve static files from public/
const publicDir = path.join(__dirname, '../public');
const homepage = path.join(publicDir, 'index.html');

app.get('/', (_req, res) => { res.sendFile(homepage); });
app.get('/mcp', (_req, res) => { res.sendFile(homepage); });
app.use(express.static(publicDir));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'noosphere' });
});

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
