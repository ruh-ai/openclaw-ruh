import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface SessionRecord {
  id: string;
  userId: string;
  refreshToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
}

function serializeRow(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    refreshToken: String(row.refresh_token),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

export async function createSession(
  userId: string,
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<SessionRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await client.query(
      `INSERT INTO sessions (id, user_id, refresh_token, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, refreshToken, userAgent ?? null, ipAddress ?? null, expiresAt],
    );
    return serializeRow(result.rows[0]);
  });
}

export async function getSessionByRefreshToken(token: string): Promise<SessionRecord | null> {
  return withConn(async (client) => {
    const result = await client.query(
      'SELECT * FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()',
      [token],
    );
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function deleteSession(id: string): Promise<void> {
  await withConn(async (client) => {
    await client.query('DELETE FROM sessions WHERE id = $1', [id]);
  });
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await withConn(async (client) => {
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  });
}

export async function cleanExpiredSessions(): Promise<number> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM sessions WHERE expires_at < NOW()');
    return result.rowCount ?? 0;
  });
}
