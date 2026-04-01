import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  subject: string;
  createdAt: string;
}

function serializeIdentityRow(row: Record<string, unknown>): AuthIdentityRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: String(row.provider),
    subject: String(row.subject),
    createdAt: String(row.created_at),
  };
}

export async function ensureAuthIdentity(
  userId: string,
  provider: string,
  subject: string,
): Promise<AuthIdentityRecord> {
  return withConn(async (client) => {
    const existing = await client.query(
      'SELECT * FROM auth_identities WHERE provider = $1 AND subject = $2 LIMIT 1',
      [provider, subject],
    );
    if (existing.rows[0]) {
      return serializeIdentityRow(existing.rows[0]);
    }

    const id = uuidv4();
    const result = await client.query(
      `
      INSERT INTO auth_identities (id, user_id, provider, subject)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [id, userId, provider, subject],
    );
    return serializeIdentityRow(result.rows[0]);
  });
}
