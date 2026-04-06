import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';
import { httpError } from '../utils';
import { normalizeBoardTaskFingerprint, taskLogStatusToBoardStatus, type BoardTaskStatus } from '../boardTaskState';

export interface BoardTask {
  id: string;
  goalId: string;
  title: string;
  description: string;
  status: BoardTaskStatus;
  priority: string;
  plannedAgent: string | null;
  completedByAgent: string | null;
  lastExecutionAgent: string | null;
  currentTaskLogId: string | null;
  latestTaskLogId: string | null;
  blockedReason: string | null;
  source: string;
  runCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(row: Record<string, unknown>): BoardTask {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    title: String(row.title),
    description: String(row.description ?? ''),
    status: String(row.status ?? 'todo') as BoardTaskStatus,
    priority: String(row.priority ?? 'normal'),
    plannedAgent: row.planned_agent ? String(row.planned_agent) : null,
    completedByAgent: row.completed_by_agent ? String(row.completed_by_agent) : null,
    lastExecutionAgent: row.last_execution_agent ? String(row.last_execution_agent) : null,
    currentTaskLogId: row.current_task_log_id ? String(row.current_task_log_id) : null,
    latestTaskLogId: row.latest_task_log_id ? String(row.latest_task_log_id) : null,
    blockedReason: row.blocked_reason ? String(row.blocked_reason) : null,
    source: String(row.source ?? 'manual'),
    runCount: Number(row.run_count ?? 0),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listBoardTasks(filters?: {
  goalId?: string;
  goalIds?: string[];
  status?: string;
  plannedAgent?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: BoardTask[]; total: number }> {
  return withConn(async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.goalId) {
      conditions.push(`goal_id = $${idx++}`);
      params.push(filters.goalId);
    }

    if (filters?.goalIds?.length) {
      conditions.push(`goal_id = ANY($${idx++})`);
      params.push(filters.goalIds);
    }

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }

    if (filters?.plannedAgent) {
      conditions.push(`planned_agent = $${idx++}`);
      params.push(filters.plannedAgent);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 200;
    const offset = filters?.offset ?? 0;

    const countResult = await client.query(`SELECT COUNT(*) FROM board_tasks ${where}`, params);
    const total = parseInt(String(countResult.rows[0]?.count ?? '0'), 10);

    const result = await client.query(
      `SELECT * FROM board_tasks ${where}
       ORDER BY
         CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 WHEN 'done' THEN 3 END,
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
         created_at ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { items: result.rows.map(serialize), total };
  });
}

export async function getBoardTask(id: string): Promise<BoardTask> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM board_tasks WHERE id = $1', [id]);
    if (!result.rows[0]) throw httpError(404, 'Board task not found');
    return serialize(result.rows[0]);
  });
}

export async function createBoardTask(data: {
  goalId: string;
  title: string;
  description?: string;
  priority?: string;
  status?: BoardTaskStatus;
  plannedAgent?: string | null;
  blockedReason?: string | null;
  source?: string;
}): Promise<{ task: BoardTask; created: boolean }> {
  if (!data.goalId) throw httpError(400, 'goalId is required');

  return withConn(async (client) => {
    const fingerprint = normalizeBoardTaskFingerprint(`${data.title} ${data.description ?? ''}`);
    const existing = await client.query(
      `SELECT * FROM board_tasks
       WHERE goal_id = $1
         AND dedup_fingerprint = $2
         AND status <> 'done'
       ORDER BY created_at DESC
       LIMIT 1`,
      [data.goalId, fingerprint],
    );

    if (existing.rows[0]) {
      return { task: serialize(existing.rows[0]), created: false };
    }

    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO board_tasks (
        id,
        goal_id,
        title,
        description,
        status,
        priority,
        planned_agent,
        blocked_reason,
        source,
        dedup_fingerprint
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        data.goalId,
        data.title,
        data.description ?? '',
        data.status ?? 'todo',
        data.priority ?? 'normal',
        data.plannedAgent ?? null,
        data.blockedReason ?? null,
        data.source ?? 'manual',
        fingerprint,
      ],
    );

    return { task: serialize(result.rows[0]), created: true };
  });
}

export async function updateBoardTask(id: string, patch: {
  title?: string;
  description?: string;
  status?: BoardTaskStatus;
  priority?: string;
  plannedAgent?: string | null;
  completedByAgent?: string | null;
  blockedReason?: string | null;
}): Promise<BoardTask> {
  return withConn(async (client) => {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.title !== undefined) {
      sets.push(`title = $${idx++}`);
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(patch.description);
    }
    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(patch.status);
      if (patch.status === 'done') {
        sets.push(`completed_at = NOW()`);
      } else {
        sets.push(`completed_at = NULL`);
      }
      if (patch.status !== 'blocked' && patch.blockedReason === undefined) {
        sets.push(`blocked_reason = NULL`);
      }
    }
    if (patch.priority !== undefined) {
      sets.push(`priority = $${idx++}`);
      params.push(patch.priority);
    }
    if (patch.plannedAgent !== undefined) {
      sets.push(`planned_agent = $${idx++}`);
      params.push(patch.plannedAgent);
    }
    if (patch.completedByAgent !== undefined) {
      sets.push(`completed_by_agent = $${idx++}`);
      params.push(patch.completedByAgent);
    }
    if (patch.blockedReason !== undefined) {
      sets.push(`blocked_reason = $${idx++}`);
      params.push(patch.blockedReason);
    }

    if (patch.title !== undefined || patch.description !== undefined) {
      const fingerprint = normalizeBoardTaskFingerprint(`${patch.title ?? ''} ${patch.description ?? ''}`);
      sets.push(`dedup_fingerprint = $${idx++}`);
      params.push(fingerprint);
    }

    const result = await client.query(
      `UPDATE board_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id],
    );

    if (!result.rows[0]) throw httpError(404, 'Board task not found');
    return serialize(result.rows[0]);
  });
}

export async function attachTaskLog(boardTaskId: string, taskLogId: string, agentName: string | null): Promise<BoardTask> {
  return withConn(async (client) => {
    const result = await client.query(
      `UPDATE board_tasks
       SET
         current_task_log_id = $1,
         latest_task_log_id = $1,
         last_execution_agent = COALESCE($2, last_execution_agent),
         status = 'in_progress',
         blocked_reason = NULL,
         completed_at = NULL,
         run_count = run_count + 1,
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [taskLogId, agentName, boardTaskId],
    );

    if (!result.rows[0]) throw httpError(404, 'Board task not found');
    return serialize(result.rows[0]);
  });
}

export async function syncBoardTaskFromTaskLog(taskLogId: string, patch: {
  taskStatus: string;
  agentName?: string | null;
  error?: string | null;
}): Promise<BoardTask | null> {
  return withConn(async (client) => {
    const boardStatus = taskLogStatusToBoardStatus(patch.taskStatus);
    const result = await client.query(
      `UPDATE board_tasks
       SET
         status = $1,
         current_task_log_id = CASE WHEN $1 = 'in_progress' THEN $2 ELSE NULL END,
         latest_task_log_id = $2,
         last_execution_agent = COALESCE($3, last_execution_agent),
         completed_by_agent = CASE WHEN $1 = 'done' THEN COALESCE($3, completed_by_agent) ELSE completed_by_agent END,
         blocked_reason = CASE WHEN $1 = 'blocked' THEN $4 ELSE NULL END,
         completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END,
         updated_at = NOW()
       WHERE id = (SELECT board_task_id FROM task_logs WHERE id = $2)
       RETURNING *`,
      [boardStatus, taskLogId, patch.agentName ?? null, patch.error ?? null],
    );

    if (!result.rows[0]) return null;
    return serialize(result.rows[0]);
  });
}
