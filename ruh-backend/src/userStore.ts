// @kb: 014-auth-system 005-data-models
import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'developer' | 'end_user';
  orgId: string | null;
  status: 'active' | 'suspended' | 'pending';
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

function serializeRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    role: String(row.role) as UserRecord['role'],
    orgId: row.org_id ? String(row.org_id) : null,
    status: String(row.status) as UserRecord['status'],
    emailVerified: Boolean(row.email_verified),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createUser(
  email: string,
  passwordHash: string,
  displayName: string,
  role: UserRecord['role'] = 'end_user',
  orgId?: string,
): Promise<UserRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, role, org_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, email, passwordHash, displayName, role, orgId ?? null],
    );
    return serializeRow(result.rows[0]);
  });
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function listUsers(filters?: {
  role?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: UserRecord[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.role) {
      conditions.push(`role = $${paramIdx++}`);
      params.push(filters.role);
    }
    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push(`(email ILIKE $${paramIdx} OR display_name ILIKE $${paramIdx})`);
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await client.query(`SELECT COUNT(*) FROM users ${where}`, params);
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serializeRow), total };
  });
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserRecord, 'displayName' | 'avatarUrl' | 'role' | 'status' | 'emailVerified'>>,
): Promise<UserRecord | null> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.displayName !== undefined) { sets.push(`display_name = $${idx++}`); params.push(patch.displayName); }
    if (patch.avatarUrl !== undefined) { sets.push(`avatar_url = $${idx++}`); params.push(patch.avatarUrl); }
    if (patch.role !== undefined) { sets.push(`role = $${idx++}`); params.push(patch.role); }
    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.emailVerified !== undefined) { sets.push(`email_verified = $${idx++}`); params.push(patch.emailVerified); }

    if (sets.length === 0) return getUserById(id);

    sets.push(`updated_at = NOW()`);
    const result = await client.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}
