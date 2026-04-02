import { v4 as uuidv4 } from 'uuid';
import { withConn } from './db';

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  kind: 'developer' | 'customer';
  plan: string;
  status: 'active' | 'suspended' | 'archived';
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
    status: String(row.status ?? 'active') as OrgRecord['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createOrg(
  name: string,
  slug: string,
  kind: OrgRecord['kind'] = 'customer',
  options: {
    plan?: string;
    status?: OrgRecord['status'];
  } = {},
): Promise<OrgRecord> {
  return withConn(async (client) => {
    const id = uuidv4();
    const columns = ['id', 'name', 'slug', 'kind'];
    const values: unknown[] = [id, name, slug, kind];

    if (typeof options.plan === 'string' && options.plan.trim()) {
      columns.push('plan');
      values.push(options.plan.trim());
    }

    if (typeof options.status === 'string') {
      columns.push('status');
      values.push(options.status);
    }

    const result = await client.query(
      `INSERT INTO organizations (${columns.join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values,
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

export async function updateOrg(
  id: string,
  patch: {
    name?: string;
    slug?: string;
    plan?: string;
    status?: OrgRecord['status'];
  },
): Promise<OrgRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof patch.name === 'string') {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }

  if (typeof patch.slug === 'string') {
    params.push(patch.slug);
    sets.push(`slug = $${params.length}`);
  }

  if (typeof patch.plan === 'string') {
    params.push(patch.plan);
    sets.push(`plan = $${params.length}`);
  }

  if (typeof patch.status === 'string') {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }

  if (sets.length === 0) {
    return getOrg(id);
  }

  params.push(id);

  return withConn(async (client) => {
    const result = await client.query(
      `
      UPDATE organizations
      SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING *
      `,
      params,
    );
    return result.rows[0] ? serializeRow(result.rows[0]) : null;
  });
}

export async function deleteOrg(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM organizations WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}
