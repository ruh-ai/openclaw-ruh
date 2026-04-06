import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';
import { getEffectiveQueueJobStatus } from '../queueJobState';

export interface QueueJob {
  id: string;
  queueName: string;
  jobId: string;
  taskLogId: string | null;
  agentName: string | null;
  priority: number;
  status: string;
  source: string;
  prompt: string | null;
  resultJson: unknown;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): QueueJob {
  const rawQueueStatus = String(row.status);
  const effectiveStatus = typeof row.effective_status === 'string'
    ? String(row.effective_status)
    : getEffectiveQueueJobStatus(rawQueueStatus, typeof row.task_status === 'string' ? String(row.task_status) : null);

  return {
    id: String(row.id),
    queueName: String(row.queue_name),
    jobId: String(row.job_id),
    taskLogId: row.task_log_id ? String(row.task_log_id) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    priority: Number(row.priority ?? 5),
    status: effectiveStatus,
    source: String(row.source ?? 'api'),
    prompt: row.prompt ? String(row.prompt) : null,
    resultJson: row.result_json ?? null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    timeoutMs: Number(row.timeout_ms ?? 600000),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function createQueueJob(data: {
  id?: string;
  queueName: string;
  jobId: string;
  taskLogId?: string;
  agentName?: string;
  priority?: number;
  status?: string;
  source?: string;
  prompt?: string;
  maxAttempts?: number;
  timeoutMs?: number;
}): Promise<QueueJob> {
  return withConn(async (client) => {
    const id = data.id || uuidv4();
    const result = await client.query(
      `INSERT INTO queue_jobs (id, queue_name, job_id, task_log_id, agent_name, priority, status, source, prompt, max_attempts, timeout_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, data.queueName, data.jobId, data.taskLogId || null, data.agentName || null,
       data.priority ?? 5, data.status ?? 'waiting', data.source ?? 'api',
       data.prompt || null, data.maxAttempts ?? 3, data.timeoutMs ?? 600000],
    );
    return serialize(result.rows[0]);
  });
}

export async function updateQueueJob(id: string, patch: {
  jobId?: string;
  status?: string;
  resultJson?: unknown;
  errorMessage?: string;
  attempts?: number;
  startedAt?: string;
  completedAt?: string;
}): Promise<QueueJob> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.jobId !== undefined) { sets.push(`job_id = $${idx++}`); params.push(patch.jobId); }
    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.resultJson !== undefined) { sets.push(`result_json = $${idx++}`); params.push(JSON.stringify(patch.resultJson)); }
    if (patch.errorMessage !== undefined) { sets.push(`error_message = $${idx++}`); params.push(patch.errorMessage); }
    if (patch.attempts !== undefined) { sets.push(`attempts = $${idx++}`); params.push(patch.attempts); }
    if (patch.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); params.push(patch.startedAt); }
    if (patch.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(patch.completedAt); }

    if (sets.length === 0) throw httpError(400, 'No fields to update');

    const result = await client.query(
      `UPDATE queue_jobs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    if (!result.rows[0]) throw httpError(404, 'Queue job not found');
    return serialize(result.rows[0]);
  });
}

export async function getQueueJob(id: string): Promise<QueueJob> {
  return withConn(async (client) => {
    const result = await client.query(`
      SELECT
        q.*,
        t.status as task_status,
        CASE
          WHEN q.status IN ('waiting', 'active') AND t.status = 'completed' THEN 'completed'
          WHEN q.status IN ('waiting', 'active') AND t.status = 'failed' THEN 'failed'
          ELSE q.status
        END as effective_status
      FROM queue_jobs q
      LEFT JOIN task_logs t ON t.id = q.task_log_id
      WHERE q.id = $1
    `, [id]);
    if (!result.rows[0]) throw httpError(404, 'Queue job not found');
    return serialize(result.rows[0]);
  });
}

export async function listQueueJobs(filters?: {
  queueName?: string;
  status?: string;
  agentName?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: QueueJob[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.queueName) { conditions.push(`queue_name = $${idx++}`); params.push(filters.queueName); }
    if (filters?.status) { conditions.push(`effective_status = $${idx++}`); params.push(filters.status); }
    if (filters?.agentName) { conditions.push(`agent_name = $${idx++}`); params.push(filters.agentName); }
    if (filters?.source) { conditions.push(`source = $${idx++}`); params.push(filters.source); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const cte = `
      WITH queue_jobs_view AS (
        SELECT
          q.*,
          t.status as task_status,
          CASE
            WHEN q.status IN ('waiting', 'active') AND t.status = 'completed' THEN 'completed'
            WHEN q.status IN ('waiting', 'active') AND t.status = 'failed' THEN 'failed'
            ELSE q.status
          END as effective_status
        FROM queue_jobs q
        LEFT JOIN task_logs t ON t.id = q.task_log_id
      )
    `;

    const countResult = await client.query(`${cte} SELECT COUNT(*) FROM queue_jobs_view ${where}`, params);
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `${cte}
       SELECT * FROM queue_jobs_view ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serialize), total };
  });
}

export async function getQueueStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number }>> {
  return withConn(async (client) => {
    const result = await client.query(`
      WITH queue_jobs_view AS (
        SELECT
          q.queue_name,
          CASE
            WHEN q.status IN ('waiting', 'active') AND t.status = 'completed' THEN 'completed'
            WHEN q.status IN ('waiting', 'active') AND t.status = 'failed' THEN 'failed'
            ELSE q.status
          END as effective_status
        FROM queue_jobs q
        LEFT JOIN task_logs t ON t.id = q.task_log_id
      )
      SELECT
        queue_name,
        COUNT(*) FILTER (WHERE effective_status = 'waiting') as waiting,
        COUNT(*) FILTER (WHERE effective_status = 'active') as active,
        COUNT(*) FILTER (WHERE effective_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE effective_status = 'failed') as failed
      FROM queue_jobs_view
      GROUP BY queue_name
    `);

    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};
    for (const row of result.rows) {
      stats[String(row.queue_name)] = {
        waiting: Number(row.waiting),
        active: Number(row.active),
        completed: Number(row.completed),
        failed: Number(row.failed),
      };
    }
    return stats;
  });
}

export async function deleteQueueJob(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM queue_jobs WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}
