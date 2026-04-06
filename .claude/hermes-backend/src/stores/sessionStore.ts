import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';
import type { TaskLog } from './taskStore';

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  tasksCount: number;
  learningsCount: number;
  summary: string | null;
}

export interface SessionListItem extends Session {
  taskCount: number;
  activeTaskCount: number;
}

export interface SessionDetail extends Session {
  tasks: TaskLog[];
}

function serialize(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    tasksCount: Number(row.tasks_count),
    learningsCount: Number(row.learnings_count),
    summary: row.summary ? String(row.summary) : null,
  };
}

function serializeTask(row: Record<string, unknown>): TaskLog {
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

export async function listSessions(limit = 20): Promise<SessionListItem[]> {
  return withConn(async (client) => {
    const result = await client.query(`
      SELECT s.*,
        COUNT(t.id)                                           AS task_count,
        COUNT(t.id) FILTER (WHERE t.status = 'running')      AS active_task_count
      FROM sessions s
      LEFT JOIN task_logs t ON t.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows.map(row => ({
      ...serialize(row),
      taskCount: Number(row.task_count),
      activeTaskCount: Number(row.active_task_count),
    }));
  });
}

export async function getSessionDetail(id: string): Promise<SessionDetail> {
  return withConn(async (client) => {
    const sessionRes = await client.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (!sessionRes.rows[0]) throw httpError(404, 'Session not found');

    // Fetch all tasks for this session ordered by creation time
    const tasksRes = await client.query(
      `SELECT * FROM task_logs WHERE session_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    return {
      ...serialize(sessionRes.rows[0]),
      tasks: tasksRes.rows.map(serializeTask),
    };
  });
}

export async function createSession(): Promise<Session> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query('INSERT INTO sessions (id) VALUES ($1) RETURNING *', [id]);
    return serialize(result.rows[0]);
  });
}

export async function updateSession(
  id: string,
  patch: { endedAt?: string; tasksCount?: number; learningsCount?: number; summary?: string },
): Promise<Session> {
  return withConn(async (client) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.endedAt !== undefined) { sets.push(`ended_at = NOW()`); }
    if (patch.tasksCount !== undefined) { sets.push(`tasks_count = $${idx++}`); params.push(patch.tasksCount); }
    if (patch.learningsCount !== undefined) { sets.push(`learnings_count = $${idx++}`); params.push(patch.learningsCount); }
    if (patch.summary !== undefined) { sets.push(`summary = $${idx++}`); params.push(patch.summary); }

    if (sets.length === 0) throw httpError(400, 'No fields to update');

    const result = await client.query(
      `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );
    if (!result.rows[0]) throw httpError(404, 'Session not found');
    return serialize(result.rows[0]);
  });
}
