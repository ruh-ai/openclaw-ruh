import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  kind: 'developer' | 'customer';
  plan: string;
  createdAt: string;
  updatedAt: string;
}

function serializeRow(row: Record<string, unknown>): OrgRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    kind: String(row.kind ?? 'customer') as OrgRecord['kind'],
    plan: String(row.plan),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createOrg(
  name: string,
  slug: string,
  kind: OrgRecord['kind'] = 'customer',
): Promise<OrgRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO organizations (id, name, slug, kind) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, name, slug, kind],
    );
    return serializeRow(result.rows[0]);
  });
}

export async function getOrg(id: string): Promise<OrgRecord | null> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM organizations WHERE id = $1', [id]);
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function listOrgs(): Promise<OrgRecord[]> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM organizations ORDER BY created_at DESC');
    return result.rows.map(serializeRow);
  });
}
