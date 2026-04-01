import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  agentName: string;
  priority: number;
  timeoutMs: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): ScheduledTask {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    cronExpression: String(row.cron_expression),
    agentName: String(row.agent_name ?? 'auto'),
    priority: Number(row.priority ?? 5),
    timeoutMs: Number(row.timeout_ms ?? 600000),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    runCount: Number(row.run_count ?? 0),
    createdAt: String(row.created_at),
  };
}

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM scheduled_tasks ORDER BY created_at DESC');
    return result.rows.map(serialize);
  });
}

export async function getScheduledTask(id: string): Promise<ScheduledTask> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM scheduled_tasks WHERE id = $1', [id]);
    if (!result.rows[0]) throw httpError(404, 'Scheduled task not found');
    return serialize(result.rows[0]);
  });
}

export async function createScheduledTask(data: {
  name: string;
  description: string;
  cronExpression: string;
  agentName?: string;
  priority?: number;
  timeoutMs?: number;
}): Promise<ScheduledTask> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO scheduled_tasks (id, name, description, cron_expression, agent_name, priority, timeout_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, data.name, data.description, data.cronExpression,
       data.agentName ?? 'auto', data.priority ?? 5, data.timeoutMs ?? 600000],
    );
    return serialize(result.rows[0]);
  });
}

export async function updateScheduledTask(id: string, patch: {
  name?: string;
  description?: string;
  cronExpression?: string;
  agentName?: string;
  priority?: number;
  timeoutMs?: number;
  enabled?: boolean;
  lastRunAt?: string;
  runCount?: number;
}): Promise<ScheduledTask> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.name !== undefined) { sets.push(`name = $${idx++}`); params.push(patch.name); }
    if (patch.description !== undefined) { sets.push(`description = $${idx++}`); params.push(patch.description); }
    if (patch.cronExpression !== undefined) { sets.push(`cron_expression = $${idx++}`); params.push(patch.cronExpression); }
    if (patch.agentName !== undefined) { sets.push(`agent_name = $${idx++}`); params.push(patch.agentName); }
    if (patch.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(patch.priority); }
    if (patch.timeoutMs !== undefined) { sets.push(`timeout_ms = $${idx++}`); params.push(patch.timeoutMs); }
    if (patch.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(patch.enabled); }
    if (patch.lastRunAt !== undefined) { sets.push(`last_run_at = $${idx++}`); params.push(patch.lastRunAt); }
    if (patch.runCount !== undefined) { sets.push(`run_count = $${idx++}`); params.push(patch.runCount); }

    if (sets.length === 0) throw httpError(400, 'No fields to update');

    const result = await client.query(
      `UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    if (!result.rows[0]) throw httpError(404, 'Scheduled task not found');
    return serialize(result.rows[0]);
  });
}

export async function deleteScheduledTask(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM scheduled_tasks WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}
