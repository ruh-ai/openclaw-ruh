/**
 * Eval result store — persists agent evaluation results.
 *
 * Each eval run (single pass or reinforcement loop) is saved with its
 * full task list, scores, loop state, and mutations. This enables:
 *   - Historical eval comparison across agent versions
 *   - Resuming eval review after page refresh
 *   - Enterprise audit trail of agent quality
 */

import { randomUUID } from 'node:crypto';
import { withConn } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalResult {
  id: string;
  agent_id: string;
  sandbox_id: string | null;
  mode: string;
  tasks: unknown[];
  loop_state: unknown | null;
  pass_rate: number;
  avg_score: number;
  total_tasks: number;
  passed_tasks: number;
  failed_tasks: number;
  iterations: number;
  stop_reason: string | null;
  created_at: string;
}

export interface CreateEvalResultInput {
  agent_id: string;
  sandbox_id?: string | null;
  mode: string;
  tasks: unknown[];
  loop_state?: unknown | null;
  pass_rate: number;
  avg_score: number;
  total_tasks: number;
  passed_tasks: number;
  failed_tasks: number;
  iterations?: number;
  stop_reason?: string | null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export async function createEvalResult(input: CreateEvalResultInput): Promise<EvalResult> {
  const id = randomUUID();
  const row = await withConn(async (client) => {
    const result = await client.query(
      `INSERT INTO eval_results (id, agent_id, sandbox_id, mode, tasks, loop_state, pass_rate, avg_score, total_tasks, passed_tasks, failed_tasks, iterations, stop_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        input.agent_id,
        input.sandbox_id ?? null,
        input.mode,
        JSON.stringify(input.tasks),
        input.loop_state ? JSON.stringify(input.loop_state) : null,
        input.pass_rate,
        input.avg_score,
        input.total_tasks,
        input.passed_tasks,
        input.failed_tasks,
        input.iterations ?? 1,
        input.stop_reason ?? null,
      ],
    );
    return result.rows[0];
  });
  return rowToEvalResult(row);
}

export async function getEvalResult(id: string): Promise<EvalResult | null> {
  const row = await withConn(async (client) => {
    const result = await client.query('SELECT * FROM eval_results WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  });
  return row ? rowToEvalResult(row) : null;
}

export async function listEvalResults(
  agentId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ items: EvalResult[]; total: number }> {
  return withConn(async (client) => {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;

    const countResult = await client.query(
      'SELECT COUNT(*) FROM eval_results WHERE agent_id = $1',
      [agentId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await client.query(
      'SELECT * FROM eval_results WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [agentId, limit, offset],
    );

    return {
      items: result.rows.map(rowToEvalResult),
      total,
    };
  });
}

export async function deleteEvalResult(id: string): Promise<boolean> {
  return withConn(async (client) => {
    const result = await client.query('DELETE FROM eval_results WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToEvalResult(row: Record<string, unknown>): EvalResult {
  return {
    id: row.id as string,
    agent_id: row.agent_id as string,
    sandbox_id: (row.sandbox_id as string) ?? null,
    mode: row.mode as string,
    tasks: typeof row.tasks === 'string' ? JSON.parse(row.tasks) : (row.tasks as unknown[]) ?? [],
    loop_state: row.loop_state
      ? typeof row.loop_state === 'string' ? JSON.parse(row.loop_state) : row.loop_state
      : null,
    pass_rate: Number(row.pass_rate) || 0,
    avg_score: Number(row.avg_score) || 0,
    total_tasks: Number(row.total_tasks) || 0,
    passed_tasks: Number(row.passed_tasks) || 0,
    failed_tasks: Number(row.failed_tasks) || 0,
    iterations: Number(row.iterations) || 1,
    stop_reason: (row.stop_reason as string) ?? null,
    created_at: String(row.created_at),
  };
}
