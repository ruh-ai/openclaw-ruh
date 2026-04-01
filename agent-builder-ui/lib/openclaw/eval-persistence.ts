/**
 * eval-persistence.ts — Save and load eval results from the backend.
 *
 * Called after an eval run completes to persist results across page refreshes.
 * Also used to load historical eval results for comparison.
 */

import type { EvalTask, EvalLoopState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SavedEvalResult {
  id: string;
  agent_id: string;
  sandbox_id: string | null;
  mode: string;
  tasks: EvalTask[];
  loop_state: EvalLoopState | null;
  pass_rate: number;
  avg_score: number;
  total_tasks: number;
  passed_tasks: number;
  failed_tasks: number;
  iterations: number;
  stop_reason: string | null;
  created_at: string;
}

/**
 * Save eval results to the backend.
 */
export async function saveEvalResults(
  agentId: string,
  data: {
    sandboxId?: string | null;
    mode: string;
    tasks: EvalTask[];
    loopState?: EvalLoopState | null;
  },
): Promise<SavedEvalResult> {
  const passed = data.tasks.filter((t) => t.status === "pass").length;
  const failed = data.tasks.filter((t) => t.status === "fail").length;
  const total = data.tasks.length;
  const avgScore = total > 0
    ? data.tasks.reduce((sum, t) => sum + (t.confidence ?? 0), 0) / total
    : 0;

  const res = await fetch(`${API_BASE}/api/agents/${agentId}/eval-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      sandbox_id: data.sandboxId ?? null,
      mode: data.mode,
      tasks: data.tasks,
      loop_state: data.loopState ?? null,
      pass_rate: total > 0 ? passed / total : 0,
      avg_score: avgScore,
      total_tasks: total,
      passed_tasks: passed,
      failed_tasks: failed,
      iterations: data.loopState?.iteration ?? 1,
      stop_reason: data.loopState?.stopReason ?? null,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to save eval results: ${res.status}`);
  }

  return res.json();
}

/**
 * Load eval result history for an agent.
 */
export async function loadEvalResults(
  agentId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ items: SavedEvalResult[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const res = await fetch(
    `${API_BASE}/api/agents/${agentId}/eval-results?${params.toString()}`,
    { credentials: "include" },
  );

  if (!res.ok) {
    throw new Error(`Failed to load eval results: ${res.status}`);
  }

  return res.json();
}

/**
 * Load a single eval result by ID.
 */
export async function loadEvalResult(
  agentId: string,
  evalId: string,
): Promise<SavedEvalResult> {
  const res = await fetch(
    `${API_BASE}/api/agents/${agentId}/eval-results/${evalId}`,
    { credentials: "include" },
  );

  if (!res.ok) {
    throw new Error(`Failed to load eval result: ${res.status}`);
  }

  return res.json();
}
