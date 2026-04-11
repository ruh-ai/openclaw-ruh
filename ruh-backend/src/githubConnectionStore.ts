/**
 * githubConnectionStore.ts — GitHub OAuth connection storage.
 */

import { withConn } from './db';

/**
 * If the stored token is base64-encoded JSON like `{"token":"gho_..."}`,
 * unwrap it to the raw token. Otherwise return as-is.
 */
function normalizeToken(raw: string): string {
  if (!raw || raw.startsWith('gho_') || raw.startsWith('ghp_') || raw.startsWith('github_pat_')) {
    return raw;
  }
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    if (typeof decoded?.token === 'string') return decoded.token;
  } catch { /* not base64 JSON — return as-is */ }
  return raw;
}

export async function getAccessToken(userId: string): Promise<{ token: string; username: string } | null> {
  return withConn(async (client) => {
    const res = await client.query(
      `SELECT access_token, github_username FROM github_connections WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    return { token: normalizeToken(res.rows[0].access_token as string), username: res.rows[0].github_username as string };
  });
}

export async function getConnection(userId: string): Promise<{
  connected: boolean; username: string | null; connectedAt: string | null;
} | null> {
  return withConn(async (client) => {
    const res = await client.query(
      `SELECT github_username, connected_at FROM github_connections WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return { connected: false, username: null, connectedAt: null };
    return {
      connected: true,
      username: res.rows[0].github_username as string,
      connectedAt: String(res.rows[0].connected_at),
    };
  });
}

export async function upsertConnection(data: {
  userId: string; githubUserId: string; githubUsername: string; accessToken: string; tokenScope?: string;
}): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `INSERT INTO github_connections (user_id, github_user_id, github_username, access_token, token_scope)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         github_user_id = $2, github_username = $3, access_token = $4,
         token_scope = $5, updated_at = NOW()`,
      [data.userId, data.githubUserId, data.githubUsername, data.accessToken, data.tokenScope ?? 'repo'],
    );
  });
}

export async function deleteConnection(userId: string): Promise<boolean> {
  return withConn(async (client) => {
    const res = await client.query(`DELETE FROM github_connections WHERE user_id = $1`, [userId]);
    return (res.rowCount ?? 0) > 0;
  });
}
