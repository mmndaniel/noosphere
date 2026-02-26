import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getDb } from '../db/connection.js';

interface ClientRow {
  client_id: string;
  client_secret: string | null;
  client_id_issued_at: number | null;
  client_secret_expires_at: number | null;
  redirect_uris: string;
  client_name: string | null;
  client_uri: string | null;
  grant_types: string | null;
  response_types: string | null;
  token_endpoint_auth_method: string | null;
  scope: string | null;
}

function rowToClient(row: ClientRow): OAuthClientInformationFull {
  return {
    client_id: row.client_id,
    ...(row.client_secret && { client_secret: row.client_secret }),
    ...(row.client_id_issued_at != null && { client_id_issued_at: row.client_id_issued_at }),
    ...(row.client_secret_expires_at != null && { client_secret_expires_at: row.client_secret_expires_at }),
    redirect_uris: JSON.parse(row.redirect_uris),
    ...(row.client_name && { client_name: row.client_name }),
    ...(row.client_uri && { client_uri: new URL(row.client_uri) }),
    ...(row.grant_types && { grant_types: JSON.parse(row.grant_types) }),
    ...(row.response_types && { response_types: JSON.parse(row.response_types) }),
    ...(row.token_endpoint_auth_method && { token_endpoint_auth_method: row.token_endpoint_auth_method }),
    ...(row.scope && { scope: row.scope }),
  } as OAuthClientInformationFull;
}

export class SqliteClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const db = getDb();
    const row = db.prepare(
      'SELECT * FROM oauth_clients WHERE client_id = ?'
    ).get(clientId) as ClientRow | undefined;

    if (!row) return undefined;
    return rowToClient(row);
  }

  registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    try {
      const db = getDb();

      db.prepare(`
        INSERT INTO oauth_clients (
          client_id, client_secret, client_id_issued_at, client_secret_expires_at,
          redirect_uris, client_name, client_uri, grant_types, response_types,
          token_endpoint_auth_method, scope
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        client.client_id,
        client.client_secret ?? null,
        client.client_id_issued_at ?? null,
        client.client_secret_expires_at ?? null,
        JSON.stringify(client.redirect_uris.map(u => String(u))),
        client.client_name ?? null,
        client.client_uri ? String(client.client_uri) : null,
        client.grant_types ? JSON.stringify(client.grant_types) : null,
        client.response_types ? JSON.stringify(client.response_types) : null,
        client.token_endpoint_auth_method ?? null,
        client.scope ?? null,
      );

      return client;
    } catch (err) {
      console.error('registerClient error:', err);
      throw err;
    }
  }
}
