import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';

export interface TaskLog {
  id: string;
  description: string;
  status: string;
  delegatedTo: string | null;
  startedAt: string;
  completedAt: string | null;
  resultSummary: string | null;
  error: string | null;
  sessionId: string | null;
  parentTaskId: string | null;
  priority: string;
  durationMs: number | null;
  goalId: string | null;
  boardTaskId: string | null;
  createdAt: string;
}

function serialize(row: Record<string, unknown>): TaskLog {
  return {
    id: String(row.id),
    description: String(row.description),
    status: String(row.status),
    delegatedTo: row.delegated_to ? String(row.delegated_to) : null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    resultSummary: row.result_summary ? String(row.result_summary) : null,
    error: row.error ? String(row.error) : null,
    sessionId: row.session_id ? String(row.session_id) : null,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    priority: row.priority ? String(row.priority) : 'normal',
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    goalId: row.goal_id ? String(row.goal_id) : null,
    boardTaskId: row.board_task_id ? String(row.board_task_id) : null,
    createdAt: String(row.created_at),
  };
}

export async function listTasks(filters?: {
  status?: string;
  delegatedTo?: string;
  sessionId?: string;
  goalId?: string;
  boardTaskId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: TaskLog[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.delegatedTo) { conditions.push(`delegated_to = $${idx++}`); params.push(filters.delegatedTo); }
    if (filters?.sessionId) { conditions.push(`session_id = $${idx++}`); params.push(filters.sessionId); }
    if (filters?.goalId) { conditions.push(`goal_id = $${idx++}`); params.push(filters.goalId); }
    if (filters?.boardTaskId) { conditions.push(`board_task_id = $${idx++}`); params.push(filters.boardTaskId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await client.query(`SELECT COUNT(*) FROM task_logs ${where}`, params);
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `SELECT * FROM task_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serialize), total };
  });
}

export async function createTask(data: {
  description: string;
  delegatedTo?: string;
  sessionId?: string;
  parentTaskId?: string;
  priority?: string;
  goalId?: string;
  boardTaskId?: string;
  dedupHash?: string;
}): Promise<TaskLog> {
  return withConn(async (client) => {
    const id = uuidv4();
    const priority = data.priority || 'normal';
    const result = await client.query(
      `INSERT INTO task_logs (id, description, status, delegated_to, session_id, parent_task_id, priority, goal_id, board_task_id, dedup_hash)
       VALUES ($1, $2, 'running', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, data.description, data.delegatedTo || null, data.sessionId || null, data.parentTaskId || null, priority, data.goalId || null, data.boardTaskId || null, data.dedupHash || null],
    );
    return serialize(result.rows[0]);
  });
}

export async function updateTask(
  id: string,
  patch: { status?: string; resultSummary?: string; error?: string; completedAt?: string },
): Promise<TaskLog> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.resultSummary !== undefined) { sets.push(`result_summary = $${idx++}`); params.push(patch.resultSummary); }
    if (patch.error !== undefined) { sets.push(`error = $${idx++}`); params.push(patch.error); }
    if (patch.status === 'completed' || patch.status === 'failed') {
      sets.push(`completed_at = NOW()`);
      sets.push(`duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000`);
    }

    if (sets.length === 0) throw httpError(400, 'No fields to update');

    const result = await client.query(
      `UPDATE task_logs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    if (!result.rows[0]) throw httpError(404, 'Task not found');
    return serialize(result.rows[0]);
  });
}

export async function getTaskTree(parentId: string): Promise<TaskLog[]> {
  return withConn(async (client) => {
    const result = await client.query(`
      WITH RECURSIVE tree AS (
        SELECT * FROM task_logs WHERE id = $1
        UNION ALL
        SELECT t.* FROM task_logs t
        INNER JOIN tree tr ON t.parent_task_id = tr.id
      )
      SELECT * FROM tree ORDER BY created_at ASC
    `, [parentId]);
    return result.rows.map(serialize);
  });
}

export async function getTaskStats(): Promise<{
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
}> {
  return withConn(async (client) => {
    const res = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'running') as running
      FROM task_logs
    `);
    const row = res.rows[0];
    const total = Number(row.total);
    const completed = Number(row.completed);
    const failed = Number(row.failed);
    return {
      total,
      completed,
      failed,
      running: Number(row.running),
      successRate: total > 0 ? Math.round((completed / (completed + failed)) * 100) : 0,
    };
  });
}
