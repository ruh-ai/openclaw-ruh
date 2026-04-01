/**
 * Execution recording store — captures full run traces for skill evolution.
 * Implements Phase 1 of the multi-worker agent architecture spec.
 */

import { randomUUID } from 'node:crypto';
import { withConn } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallRecord {
  tool: string;
  action: string;
  input: unknown;
  output: unknown;
  latency_ms: number;
  success: boolean;
}

export interface ExecutionRecording {
  id: string;
  agent_id: string;
  worker_id: string | null;
  task_id: string | null;
  run_id: string;
  success: boolean | null;
  tool_calls: ToolCallRecord[];
  tokens_used: { input?: number; output?: number };
  skills_applied: string[];
  skills_effective: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CreateExecutionRecordingInput {
  agent_id: string;
  worker_id?: string | null;
  task_id?: string | null;
  run_id: string;
  success?: boolean | null;
  tool_calls?: ToolCallRecord[];
  tokens_used?: { input?: number; output?: number };
  skills_applied?: string[];
  skills_effective?: string[];
  started_at?: string | null;
  completed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------

export async function createExecutionRecording(
  input: CreateExecutionRecordingInput,
): Promise<ExecutionRecording> {
  const id = randomUUID();

  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO execution_recordings (
        id, agent_id, worker_id, task_id, run_id, success,
        tool_calls, tokens_used, skills_applied, skills_effective,
        started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, agent_id, worker_id, task_id, run_id, success,
        tool_calls, tokens_used, skills_applied, skills_effective,
        started_at, completed_at, created_at
      `,
      [
        id,
        input.agent_id,
        input.worker_id ?? null,
        input.task_id ?? null,
        input.run_id,
        input.success ?? null,
        JSON.stringify(input.tool_calls ?? []),
        JSON.stringify(input.tokens_used ?? {}),
        input.skills_applied ?? [],
        input.skills_effective ?? [],
        input.started_at ?? null,
        input.completed_at ?? null,
      ],
    );
    return serializeRecording(result.rows[0]);
  });
}

export async function getExecutionRecording(
  runId: string,
  agentId: string,
): Promise<ExecutionRecording | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT id, agent_id, worker_id, task_id, run_id, success,
             tool_calls, tokens_used, skills_applied, skills_effective,
             started_at, completed_at, created_at
      FROM execution_recordings
      WHERE run_id = $1 AND agent_id = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [runId, agentId],
    );
    return result.rows.length ? serializeRecording(result.rows[0]) : null;
  });
}

export async function listExecutionRecordings(
  agentId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: ExecutionRecording[]; has_more: boolean }> {
  const limit = Math.min(Math.max(Number(opts.limit ?? 20), 1), 100);
  const offset = Math.max(Number(opts.offset ?? 0), 0);

  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT id, agent_id, worker_id, task_id, run_id, success,
             tool_calls, tokens_used, skills_applied, skills_effective,
             started_at, completed_at, created_at
      FROM execution_recordings
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [agentId, limit + 1, offset],
    );
    const has_more = result.rows.length > limit;
    return {
      items: result.rows.slice(0, limit).map(serializeRecording),
      has_more,
    };
  });
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeRecording(row: Record<string, unknown>): ExecutionRecording {
  const toIso = (v: unknown): string | null => {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : String(v);
  };

  return {
    id: String(row['id']),
    agent_id: String(row['agent_id']),
    worker_id: row['worker_id'] != null ? String(row['worker_id']) : null,
    task_id: row['task_id'] != null ? String(row['task_id']) : null,
    run_id: String(row['run_id']),
    success: row['success'] != null ? Boolean(row['success']) : null,
    tool_calls: (row['tool_calls'] as ToolCallRecord[]) ?? [],
    tokens_used: (row['tokens_used'] as { input?: number; output?: number }) ?? {},
    skills_applied: (row['skills_applied'] as string[]) ?? [],
    skills_effective: (row['skills_effective'] as string[]) ?? [],
    started_at: toIso(row['started_at']),
    completed_at: toIso(row['completed_at']),
    created_at: toIso(row['created_at']) ?? '',
  };
}
