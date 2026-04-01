import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';

export interface Goal {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  deadline: string | null;
  acceptanceCriteria: string[];
  progressPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  total: number;
  completed: number;
  failed: number;
  running: number;
  progressPct: number;
}

function serialize(row: Record<string, unknown>): Goal {
  let criteria: string[] = [];
  try {
    const raw = row.acceptance_criteria;
    if (typeof raw === 'string') criteria = JSON.parse(raw);
    else if (Array.isArray(raw)) criteria = raw as string[];
  } catch { /* default empty */ }

  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    priority: String(row.priority ?? 'normal'),
    status: String(row.status ?? 'active'),
    deadline: row.deadline ? String(row.deadline) : null,
    acceptanceCriteria: criteria,
    progressPct: Number(row.progress_pct ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createGoal(data: {
  title: string;
  description: string;
  priority?: string;
  deadline?: string;
  acceptanceCriteria?: string[];
}): Promise<Goal> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO goals (id, title, description, priority, deadline, acceptance_criteria)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, data.title, data.description, data.priority ?? 'normal',
       data.deadline || null, JSON.stringify(data.acceptanceCriteria ?? [])],
    );
    return serialize(result.rows[0]);
  });
}

export async function getGoal(id: string): Promise<Goal> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM goals WHERE id = $1', [id]);
    if (!result.rows[0]) throw httpError(404, 'Goal not found');
    return serialize(result.rows[0]);
  });
}

export async function listGoals(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Goal[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.priority) { conditions.push(`priority = $${idx++}`); params.push(filters.priority); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await client.query(`SELECT COUNT(*) FROM goals ${where}`, params);
    const total = parseInt(String(countResult.rows[0].count), 10);

    const result = await client.query(
      `SELECT * FROM goals ${where} ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
        created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serialize), total };
  });
}

export async function updateGoal(id: string, patch: {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  deadline?: string | null;
  acceptanceCriteria?: string[];
  progressPct?: number;
}): Promise<Goal> {
  return withConn(async (client) => {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.title !== undefined) { sets.push(`title = $${idx++}`); params.push(patch.title); }
    if (patch.description !== undefined) { sets.push(`description = $${idx++}`); params.push(patch.description); }
    if (patch.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(patch.priority); }
    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.deadline !== undefined) { sets.push(`deadline = $${idx++}`); params.push(patch.deadline); }
    if (patch.acceptanceCriteria !== undefined) { sets.push(`acceptance_criteria = $${idx++}`); params.push(JSON.stringify(patch.acceptanceCriteria)); }
    if (patch.progressPct !== undefined) { sets.push(`progress_pct = $${idx++}`); params.push(patch.progressPct); }

    const result = await client.query(
      `UPDATE goals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    if (!result.rows[0]) throw httpError(404, 'Goal not found');
    return serialize(result.rows[0]);
  });
}

export async function deleteGoal(id: string): Promise<boolean> {
  return withConn(async (client) => {
    // Unlink tasks first
    await client.query('UPDATE task_logs SET goal_id = NULL WHERE goal_id = $1', [id]);
    const result = await client.query('DELETE FROM goals WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}

export async function getGoalProgress(goalId: string): Promise<GoalProgress> {
  return withConn(async (client) => {
    const res = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'running') as running
      FROM task_logs WHERE goal_id = $1
    `, [goalId]);

    const row = res.rows[0];
    const total = Number(row.total);
    const completed = Number(row.completed);
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Update the goal's cached progress
    await client.query('UPDATE goals SET progress_pct = $1, updated_at = NOW() WHERE id = $2', [progressPct, goalId]);

    return {
      total,
      completed,
      failed: Number(row.failed),
      running: Number(row.running),
      progressPct,
    };
  });
}

export async function getGoalsSummary(): Promise<Array<{
  id: string;
  title: string;
  status: string;
  priority: string;
  taskCount: number;
  completedCount: number;
  progressPct: number;
}>> {
  return withConn(async (client) => {
    const result = await client.query(`
      SELECT
        g.id, g.title, g.status, g.priority,
        COUNT(t.id) as task_count,
        COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed_count
      FROM goals g
      LEFT JOIN task_logs t ON t.goal_id = g.id
      WHERE g.status = 'active'
      GROUP BY g.id, g.title, g.status, g.priority
      ORDER BY
        CASE g.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END
    `);

    return result.rows.map(r => {
      const taskCount = Number(r.task_count);
      const completedCount = Number(r.completed_count);
      return {
        id: String(r.id),
        title: String(r.title),
        status: String(r.status),
        priority: String(r.priority),
        taskCount,
        completedCount,
        progressPct: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
      };
    });
  });
}
