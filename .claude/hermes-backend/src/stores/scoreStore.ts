import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';

export interface AgentScore {
  id: string;
  agentName: string;
  taskId: string | null;
  passed: boolean;
  score: number | null;
  notes: string | null;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): AgentScore {
  return {
    id: String(row.id),
    agentName: String(row.agent_name),
    taskId: row.task_id ? String(row.task_id) : null,
    passed: Boolean(row.passed),
    score: row.score != null ? Number(row.score) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
  };
}

export async function listScores(filters?: {
  agentName?: string;
  limit?: number;
}): Promise<AgentScore[]> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.agentName) { conditions.push(`agent_name = $${idx++}`); params.push(filters.agentName); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;

    const result = await client.query(
      `SELECT * FROM agent_scores ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit],
    );
    return result.rows.map(serialize);
  });
}

export async function createScore(data: {
  agentName: string;
  taskId?: string;
  passed: boolean;
  score?: number;
  notes?: string;
}): Promise<AgentScore> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO agent_scores (id, agent_name, task_id, passed, score, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, data.agentName, data.taskId || null, data.passed, data.score ?? null, data.notes || null],
    );
    return serialize(result.rows[0]);
  });
}
