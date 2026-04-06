import { withConn } from '../db';
import { httpError } from '../utils';

export interface WorkerPoolConfig {
  id: string;
  queueName: string;
  agentName: string | null;
  concurrency: number;
  maxConcurrency: number;
  updatedAt: string;
}

function serialize(row: Record<string, unknown>): WorkerPoolConfig {
  return {
    id: String(row.id),
    queueName: String(row.queue_name),
    agentName: row.agent_name ? String(row.agent_name) : null,
    concurrency: Number(row.concurrency),
    maxConcurrency: Number(row.max_concurrency),
    updatedAt: String(row.updated_at),
  };
}

export async function listPoolConfigs(): Promise<WorkerPoolConfig[]> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM worker_pool_config ORDER BY queue_name');
    return result.rows.map(serialize);
  });
}

export async function getPoolConfig(id: string): Promise<WorkerPoolConfig> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM worker_pool_config WHERE id = $1', [id]);
    if (!result.rows[0]) throw httpError(404, 'Pool config not found');
    return serialize(result.rows[0]);
  });
}

export async function updatePoolConfig(id: string, patch: {
  concurrency?: number;
  maxConcurrency?: number;
}): Promise<WorkerPoolConfig> {
  return withConn(async (client) => {
    // Read current to validate
    const current = await client.query('SELECT * FROM worker_pool_config WHERE id = $1', [id]);
    if (!current.rows[0]) throw httpError(404, 'Pool config not found');

    const maxConc = patch.maxConcurrency ?? Number(current.rows[0].max_concurrency);
    const newConc = patch.concurrency ?? Number(current.rows[0].concurrency);

    if (newConc > maxConc) {
      throw httpError(400, `Concurrency ${newConc} exceeds max ${maxConc}`);
    }
    if (newConc < 0) {
      throw httpError(400, 'Concurrency must be >= 0');
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.concurrency !== undefined) { sets.push(`concurrency = $${idx++}`); params.push(patch.concurrency); }
    if (patch.maxConcurrency !== undefined) { sets.push(`max_concurrency = $${idx++}`); params.push(patch.maxConcurrency); }

    const result = await client.query(
      `UPDATE worker_pool_config SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    return serialize(result.rows[0]);
  });
}

export async function getConcurrencyMap(): Promise<Record<string, number>> {
  return withConn(async (client) => {
    const result = await client.query('SELECT queue_name, concurrency FROM worker_pool_config');
    const map: Record<string, number> = {};
    for (const row of result.rows) {
      map[String(row.queue_name)] = Number(row.concurrency);
    }
    return map;
  });
}
