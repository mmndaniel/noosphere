import type { Request, Response, NextFunction } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { ensureUser } from '../db/users.js';

// Re-export so index.ts can augment req.auth in legacy mode
declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      token: string;
      clientId: string;
      scopes: string[];
      expiresAt?: number;
      extra?: Record<string, unknown>;
    };
  }
}

/**
 * Dual-mode auth middleware factory.
 *
 * - OAuth mode (AUTH0_DOMAIN set): delegates to SDK's requireBearerAuth with JWT verification
 * - Legacy mode (no AUTH0_DOMAIN): NOOSPHERE_TOKEN simple bearer match, or open if unset
 *
 * When both AUTH0_DOMAIN and NOOSPHERE_TOKEN are set:
 *   try simple token match first (fast path for local Claude Code),
 *   then fall back to JWT verification.
 */
export function createAuthMiddleware(
  verifier?: OAuthTokenVerifier,
  resourceMetadataUrl?: string,
) {
  const simpleToken = process.env.NOOSPHERE_TOKEN;
  const hasOAuth = !!verifier;

  // Pure legacy mode
  if (!hasOAuth) {
    return function legacyAuth(req: Request, res: Response, next: NextFunction): void {
      if (!simpleToken) {
        // Open mode — set local userId
        req.auth = { token: '', clientId: 'local', scopes: [], extra: { userId: 'local' } };
        next();
        return;
      }

      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ') || header.slice(7) !== simpleToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      req.auth = { token: simpleToken, clientId: 'local', scopes: [], extra: { userId: 'local' } };
      next();
    };
  }

  // OAuth mode — build the SDK middleware
  const sdkAuth = requireBearerAuth({
    verifier,
    resourceMetadataUrl,
  });

  return function oauthAuth(req: Request, res: Response, next: NextFunction): void {
    // Fast path: if NOOSPHERE_TOKEN is set and matches, skip JWT verification
    if (simpleToken) {
      const header = req.headers.authorization;
      if (header && header === `Bearer ${simpleToken}`) {
        req.auth = { token: simpleToken, clientId: 'local', scopes: [], extra: { userId: 'local' } };
        next();
        return;
      }
    }

    // Delegate to SDK's JWT-based auth
    sdkAuth(req, res, () => {
      // After successful JWT auth, ensure user exists in DB
      const extra = req.auth?.extra as Record<string, unknown> | undefined;
      const userId = extra?.userId as string | undefined;
      if (userId) {
        ensureUser(userId, extra?.email as string, extra?.name as string);
      }
      next();
    });
  };
}
