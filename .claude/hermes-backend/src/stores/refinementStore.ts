import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';

export interface Refinement {
  id: string;
  agentName: string;
  changeDescription: string;
  reason: string | null;
  diffSummary: string | null;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): Refinement {
  return {
    id: String(row.id),
    agentName: String(row.agent_name),
    changeDescription: String(row.change_description),
    reason: row.reason ? String(row.reason) : null,
    diffSummary: row.diff_summary ? String(row.diff_summary) : null,
    createdAt: String(row.created_at),
  };
}

export async function listRefinements(filters?: {
  agentName?: string;
  limit?: number;
}): Promise<Refinement[]> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.agentName) { conditions.push(`agent_name = $${idx++}`); params.push(filters.agentName); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;

    const result = await client.query(
      `SELECT * FROM refinements ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit],
    );
    return result.rows.map(serialize);
  });
}

export async function createRefinement(data: {
  agentName: string;
  changeDescription: string;
  reason?: string;
  diffSummary?: string;
}): Promise<Refinement> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO refinements (id, agent_name, change_description, reason, diff_summary)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, data.agentName, data.changeDescription, data.reason || null, data.diffSummary || null],
    );
    return serialize(result.rows[0]);
  });
}
