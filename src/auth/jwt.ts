import * as jose from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;

let _jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    _jwks = jose.createRemoteJWKSet(
      new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

export async function verifyAuth0Token(token: string): Promise<AuthInfo> {
  const { payload } = await jose.jwtVerify(token, getJwks(), {
    issuer: `https://${AUTH0_DOMAIN}/`,
    audience: AUTH0_AUDIENCE,
    algorithms: ['RS256'],
  });

  return {
    token,
    clientId: (payload.azp as string) ?? '',
    scopes: ((payload.scope as string) ?? '').split(' ').filter(Boolean),
    expiresAt: payload.exp!,
    extra: {
      userId: payload.sub!,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    },
  };
}
