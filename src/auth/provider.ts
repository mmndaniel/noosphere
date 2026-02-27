import crypto from 'node:crypto';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { Response } from 'express';
import { SqliteClientsStore } from './clients.js';
import { verifyAuth0Token } from './jwt.js';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET!;
const ISSUER_URL = process.env.ISSUER_URL ?? 'https://usenoosphere.ai';
const AUTH_CALLBACK_URL = `${ISSUER_URL}/auth/callback`;

const _clientsStore = new SqliteClientsStore();

interface PendingAuth {
  originalRedirectUri: string;
  originalState?: string;
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Subclasses ProxyOAuthServerProvider to always use Noosphere's own Auth0
 * application credentials when talking to Auth0, regardless of which MCP
 * client_id was issued locally via DCR.
 */
export class Auth0ProxyProvider extends ProxyOAuthServerProvider {
  /** Maps serverState → pending auth info for callback redirect */
  readonly pendingAuths = new Map<string, PendingAuth>();
  private _cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    super({
      endpoints: {
        authorizationUrl: `https://${AUTH0_DOMAIN}/authorize`,
        tokenUrl: `https://${AUTH0_DOMAIN}/oauth/token`,
        revocationUrl: `https://${AUTH0_DOMAIN}/oauth/revoke`,
      },
      verifyAccessToken: verifyAuth0Token,
      getClient: (clientId: string) => Promise.resolve(_clientsStore.getClient(clientId)),
    });

    // Periodically purge expired pending auth entries
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.pendingAuths) {
        if (now - entry.createdAt > STATE_TTL_MS) {
          this.pendingAuths.delete(key);
        }
      }
    }, STATE_TTL_MS);
    this._cleanupTimer.unref();
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return _clientsStore;
  }

  /**
   * Override authorize to replace the local DCR client_id with Noosphere's
   * Auth0 client_id, add the audience parameter, and rewrite the redirect_uri
   * to our server's callback endpoint (so Auth0 sees a whitelisted URL).
   */
  async authorize(
    _client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Generate a unique server-side state and store the original redirect info
    const serverState = crypto.randomUUID();
    this.pendingAuths.set(serverState, {
      originalRedirectUri: params.redirectUri,
      originalState: params.state,
      createdAt: Date.now(),
    });

    const targetUrl = new URL(`https://${AUTH0_DOMAIN}/authorize`);
    const searchParams = new URLSearchParams({
      client_id: AUTH0_CLIENT_ID,
      response_type: 'code',
      redirect_uri: AUTH_CALLBACK_URL,
      state: serverState,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      audience: AUTH0_AUDIENCE,
    });

    // Always request openid profile email from Auth0; ignore MCP-client-specific
    // scopes (like "claudeai") that Auth0 doesn't understand.
    searchParams.set('scope', 'openid profile email offline_access');

    targetUrl.search = searchParams.toString();
    res.redirect(targetUrl.toString());
  }

  /**
   * Override to use Noosphere's Auth0 credentials instead of the local DCR client's.
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      code: authorizationCode,
    });

    if (codeVerifier) params.append('code_verifier', codeVerifier);
    // Always use our server's callback URL — Auth0 requires redirect_uri to
    // match what was used during the authorization request.
    params.append('redirect_uri', AUTH_CALLBACK_URL);

    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Auth0 token exchange failed:', response.status, text);
      throw new ServerError('Token exchange failed. Please try again.');
    }

    return OAuthTokensSchema.parse(await response.json());
  }

  /**
   * Override to use Noosphere's Auth0 credentials for refresh token exchange.
   */
  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      refresh_token: refreshToken,
    });

    if (scopes?.length) params.set('scope', scopes.join(' '));

    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Auth0 token refresh failed:', response.status, text);
      throw new ServerError('Token refresh failed. Please try again.');
    }

    return OAuthTokensSchema.parse(await response.json());
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return verifyAuth0Token(token);
  }
}

export function createAuth0Provider(): Auth0ProxyProvider {
  return new Auth0ProxyProvider();
}
