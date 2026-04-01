/**
 * Cost tracking store — cost events, budget policies, monthly spend.
 * Implements Phase 1 of the multi-worker agent architecture spec.
 */

import { randomUUID } from 'node:crypto';
import { withConn } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostEvent {
  id: string;
  agent_id: string;
  worker_id: string | null;
  task_id: string | null;
  run_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: string; // NUMERIC returned as string from pg
  created_at: string;
}

export interface CreateCostEventInput {
  agent_id: string;
  worker_id?: string | null;
  task_id?: string | null;
  run_id?: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

export interface CostEventListResult {
  items: CostEvent[];
  has_more: boolean;
}

export interface MonthlySummary {
  agent_id: string;
  month: string; // 'YYYY-MM'
  total_cost_cents: number;
  total_input_tokens: number;
  total_output_tokens: number;
  event_count: number;
}

export interface BudgetPolicy {
  id: string;
  agent_id: string;
  worker_id: string | null;
  monthly_cap_cents: number;
  soft_warning_pct: number;
  hard_stop: boolean;
  created_at: string;
}

export interface UpsertBudgetPolicyInput {
  agent_id: string;
  worker_id?: string | null;
  monthly_cap_cents: number;
  soft_warning_pct?: number;
  hard_stop?: boolean;
}

export interface BudgetStatus {
  policy: BudgetPolicy | null;
  spent_cents: number;
  cap_cents: number;
  utilization_pct: number;
  at_soft_warning: boolean;
  at_hard_stop: boolean;
}

// ---------------------------------------------------------------------------
// Cost Events
// ---------------------------------------------------------------------------

export async function createCostEvent(input: CreateCostEventInput): Promise<CostEvent> {
  const id = randomUUID();

  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO cost_events (id, agent_id, worker_id, task_id, run_id, model,
        input_tokens, output_tokens, cost_cents)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, agent_id, worker_id, task_id, run_id, model,
        input_tokens, output_tokens, cost_cents, created_at
      `,
      [
        id,
        input.agent_id,
        input.worker_id ?? null,
        input.task_id ?? null,
        input.run_id ?? null,
        input.model,
        input.input_tokens,
        input.output_tokens,
        input.cost_cents,
      ],
    );
    return serializeCostEvent(result.rows[0]);
  });
}

export async function listCostEvents(
  agentId: string,
  opts: { limit?: number; offset?: number; run_id?: string } = {},
): Promise<CostEventListResult> {
  const limit = Math.min(Math.max(Number(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);

  return withConn(async (client) => {
    const params: unknown[] = [agentId];
    const conditions = ['agent_id = $1'];

    if (opts.run_id) {
      params.push(opts.run_id);
      conditions.push(`run_id = $${params.length}`);
    }

    params.push(limit + 1, offset);

    const result = await client.query(
      `
      SELECT id, agent_id, worker_id, task_id, run_id, model,
             input_tokens, output_tokens, cost_cents, created_at
      FROM cost_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    const has_more = result.rows.length > limit;
    return {
      items: result.rows.slice(0, limit).map(serializeCostEvent),
      has_more,
    };
  });
}

export async function getMonthlySummary(agentId: string, month?: string): Promise<MonthlySummary> {
  const targetMonth = month ?? new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT
        agent_id,
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(cost_cents), 0)::NUMERIC         AS total_cost_cents,
        COALESCE(SUM(input_tokens), 0)::BIGINT         AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::BIGINT        AS total_output_tokens,
        COUNT(*)::INTEGER                              AS event_count
      FROM cost_events
      WHERE agent_id = $1
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $2::DATE)
      GROUP BY agent_id, DATE_TRUNC('month', created_at)
      `,
      [agentId, `${targetMonth}-01`],
    );

    if (result.rows.length === 0) {
      return {
        agent_id: agentId,
        month: targetMonth,
        total_cost_cents: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        event_count: 0,
      };
    }

    const row = result.rows[0];
    return {
      agent_id: row.agent_id,
      month: row.month,
      total_cost_cents: Number(row.total_cost_cents),
      total_input_tokens: Number(row.total_input_tokens),
      total_output_tokens: Number(row.total_output_tokens),
      event_count: Number(row.event_count),
    };
  });
}

// ---------------------------------------------------------------------------
// Budget Policies
// ---------------------------------------------------------------------------

export async function upsertBudgetPolicy(input: UpsertBudgetPolicyInput): Promise<BudgetPolicy> {
  const id = randomUUID();

  return withConn(async (client) => {
    const result = await client.query(
      `
      INSERT INTO budget_policies (id, agent_id, worker_id, monthly_cap_cents, soft_warning_pct, hard_stop)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (agent_id, worker_id) DO UPDATE SET
        monthly_cap_cents = EXCLUDED.monthly_cap_cents,
        soft_warning_pct  = EXCLUDED.soft_warning_pct,
        hard_stop         = EXCLUDED.hard_stop
      RETURNING id, agent_id, worker_id, monthly_cap_cents, soft_warning_pct, hard_stop, created_at
      `,
      [
        id,
        input.agent_id,
        input.worker_id ?? null,
        input.monthly_cap_cents,
        input.soft_warning_pct ?? 80,
        input.hard_stop ?? true,
      ],
    );
    return serializeBudgetPolicy(result.rows[0]);
  });
}

export async function getBudgetPolicy(
  agentId: string,
  workerId?: string | null,
): Promise<BudgetPolicy | null> {
  return withConn(async (client) => {
    const result = await client.query(
      `
      SELECT id, agent_id, worker_id, monthly_cap_cents, soft_warning_pct, hard_stop, created_at
      FROM budget_policies
      WHERE agent_id = $1 AND worker_id IS NOT DISTINCT FROM $2
      LIMIT 1
      `,
      [agentId, workerId ?? null],
    );
    return result.rows.length ? serializeBudgetPolicy(result.rows[0]) : null;
  });
}

export async function getBudgetStatus(
  agentId: string,
  workerId?: string | null,
): Promise<BudgetStatus> {
  const [policy, summary] = await Promise.all([
    getBudgetPolicy(agentId, workerId),
    getMonthlySummary(agentId),
  ]);

  const spent_cents = summary.total_cost_cents;
  const cap_cents = policy?.monthly_cap_cents ?? 0;
  const utilization_pct = cap_cents > 0 ? Math.round((spent_cents / cap_cents) * 100) : 0;
  const soft_pct = policy?.soft_warning_pct ?? 80;

  return {
    policy,
    spent_cents,
    cap_cents,
    utilization_pct,
    at_soft_warning: cap_cents > 0 && utilization_pct >= soft_pct,
    at_hard_stop: cap_cents > 0 && (policy?.hard_stop ?? false) && spent_cents >= cap_cents,
  };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeCostEvent(row: Record<string, unknown>): CostEvent {
  return {
    id: String(row['id']),
    agent_id: String(row['agent_id']),
    worker_id: row['worker_id'] != null ? String(row['worker_id']) : null,
    task_id: row['task_id'] != null ? String(row['task_id']) : null,
    run_id: row['run_id'] != null ? String(row['run_id']) : null,
    model: String(row['model']),
    input_tokens: Number(row['input_tokens']),
    output_tokens: Number(row['output_tokens']),
    cost_cents: String(row['cost_cents']),
    created_at: row['created_at'] instanceof Date
      ? row['created_at'].toISOString()
      : String(row['created_at']),
  };
}

function serializeBudgetPolicy(row: Record<string, unknown>): BudgetPolicy {
  return {
    id: String(row['id']),
    agent_id: String(row['agent_id']),
    worker_id: row['worker_id'] != null ? String(row['worker_id']) : null,
    monthly_cap_cents: Number(row['monthly_cap_cents']),
    soft_warning_pct: Number(row['soft_warning_pct']),
    hard_stop: Boolean(row['hard_stop']),
    created_at: row['created_at'] instanceof Date
      ? row['created_at'].toISOString()
      : String(row['created_at']),
  };
}
