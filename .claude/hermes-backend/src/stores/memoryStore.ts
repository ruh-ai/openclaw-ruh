import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';

export interface Memory {
  id: string;
  text: string;
  type: string;
  agent: string;
  tags: string;
  taskContext: string;
  vectorId: string | null;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id),
    text: String(row.text),
    type: String(row.type),
    agent: String(row.agent),
    tags: String(row.tags || ''),
    taskContext: String(row.task_context || ''),
    vectorId: row.vector_id ? String(row.vector_id) : null,
    createdAt: String(row.created_at),
  };
}

export async function listMemories(filters?: {
  type?: string;
  agent?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Memory[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.type) { conditions.push(`type = $${idx++}`); params.push(filters.type); }
    if (filters?.agent) { conditions.push(`agent = $${idx++}`); params.push(filters.agent); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await client.query(`SELECT COUNT(*) FROM memories ${where}`, params);
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serialize), total };
  });
}

export async function createMemory(data: {
  text: string;
  type: string;
  agent?: string;
  tags?: string;
  taskContext?: string;
  vectorId?: string;
}): Promise<Memory> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO memories (id, text, type, agent, tags, task_context, vector_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, data.text, data.type, data.agent || 'hermes', data.tags || '', data.taskContext || '', data.vectorId || null],
    );
    return serialize(result.rows[0]);
  });
}

export async function searchMemories(opts: {
  q: string;
  type?: string;
  agent?: string;
  limit?: number;
}): Promise<Memory[]> {
  return withConn(async (client) => {
    const limit = opts.limit ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [opts.q];
    let idx = 2;

    if (opts.type) { conditions.push(`type = $${idx++}`); params.push(opts.type); }
    if (opts.agent) { conditions.push(`agent = $${idx++}`); params.push(opts.agent); }

    const filterWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // Try FTS first; fall back to ILIKE if the index/operator is unavailable
    let result;
    try {
      result = await client.query(
        `SELECT *, ts_rank(to_tsvector('english', coalesce(text,'') || ' ' || coalesce(tags,'')), plainto_tsquery('english', $1)) AS rank
         FROM memories
         WHERE to_tsvector('english', coalesce(text,'') || ' ' || coalesce(tags,'')) @@ plainto_tsquery('english', $1)
         ${filterWhere}
         ORDER BY rank DESC
         LIMIT $${idx}`,
        [...params, limit],
      );
    } catch {
      // FTS not available — use ILIKE fallback
      result = await client.query(
        `SELECT * FROM memories
         WHERE (text ILIKE '%' || $1 || '%' OR tags ILIKE '%' || $1 || '%')
         ${filterWhere}
         ORDER BY created_at DESC
         LIMIT $${idx}`,
        [...params, limit],
      );
    }
    return result.rows.map(serialize);
  });
}

export async function getMemoryStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
}> {
  return withConn(async (client) => {
    const totalRes = await client.query('SELECT COUNT(*) FROM memories');
    const typeRes = await client.query('SELECT type, COUNT(*) as count FROM memories GROUP BY type ORDER BY count DESC');
    const agentRes = await client.query('SELECT agent, COUNT(*) as count FROM memories GROUP BY agent ORDER BY count DESC');

    const byType: Record<string, number> = {};
    for (const row of typeRes.rows) byType[String(row.type)] = Number(row.count);

    const byAgent: Record<string, number> = {};
    for (const row of agentRes.rows) byAgent[String(row.agent)] = Number(row.count);

    return { total: parseInt(String(totalRes.rows[0].count), 10), byType, byAgent };
  });
}
