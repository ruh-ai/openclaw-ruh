/**
 * Convergence loop helpers — pure, deterministic.
 *
 * Implements: docs/spec/openclaw-v1/008-eval-task.md §convergence-loop
 *
 * Given the running EvalLoopState (iteration history, mutations, cost),
 * the substrate computes:
 *   - whether to continue or stop, and which stop reason if stopping
 *   - estimated cost given a budget (so the runner can pre-flight)
 *
 * The runner uses these to decide between iterations. The decision is
 * pure — no I/O, no clock — so failures are reproducible and the runner
 * can replay history to debug a stop verdict.
 */

import type {
  ConvergenceLoopConfig,
  EvalBudget,
  EvalCostEstimate,
  EvalIterationScore,
  EvalLoopState,
  EvalStopReason,
} from "./types";

// ─── Stop verdict ─────────────────────────────────────────────────────

export type ContinueVerdict =
  | { readonly action: "continue" }
  | { readonly action: "stop"; readonly reason: EvalStopReason };

export interface ContinueInput {
  readonly state: EvalLoopState;
  readonly config: ConvergenceLoopConfig;
  /**
   * Optional flag from the reflector — true when the latest reflector
   * call produced zero actionable rewrites. Triggers
   * `no_actionable_changes`.
   */
  readonly reflectorReturnedZero?: boolean;
  /**
   * Optional flag from the runner — true when the most recent mutation
   * application failed (skill-file write error, schema invalid).
   * Triggers `mutation_failed`.
   */
  readonly mutationApplicationFailed?: boolean;
  /** External abort signal (user / runtime). */
  readonly aborted?: boolean;
}

/**
 * Decide whether to run another iteration.
 *
 * Order of checks (first matching reason wins):
 *   1. aborted           → "aborted"
 *   2. all_passed        → pass_rate of last iteration ≥ pass_rate_threshold
 *   3. budget_exhausted  → cost over budget
 *   4. mutation_failed   → caller signal
 *   5. no_actionable_changes → caller signal
 *   6. degraded          → max_consecutive_degradations met
 *   7. max_iterations    → state.iteration ≥ max_iterations
 *   8. otherwise         → continue
 */
export function decideContinue(input: ContinueInput): ContinueVerdict {
  const { state, config } = input;

  if (input.aborted) {
    return { action: "stop", reason: "aborted" };
  }

  // all_passed: latest iteration's pass_rate hit the threshold
  const last = state.scores[state.scores.length - 1];
  if (last && last.pass_rate >= config.pass_rate_threshold) {
    return { action: "stop", reason: "all_passed" };
  }

  // budget exhausted
  if (state.cost && exceedsBudget(state.cost, config.budget)) {
    return { action: "stop", reason: "budget_exhausted" };
  }

  if (input.mutationApplicationFailed) {
    return { action: "stop", reason: "mutation_failed" };
  }

  if (input.reflectorReturnedZero) {
    return { action: "stop", reason: "no_actionable_changes" };
  }

  // degraded: consecutive_degradations met
  if (
    consecutiveDegradations(state.scores) >= config.max_consecutive_degradations
  ) {
    return { action: "stop", reason: "degraded" };
  }

  if (state.iteration >= config.max_iterations) {
    return { action: "stop", reason: "max_iterations" };
  }

  return { action: "continue" };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function exceedsBudget(cost: EvalCostEstimate, budget: EvalBudget): boolean {
  if (cost.total_llm_calls >= budget.max_llm_calls) return true;
  if (cost.estimated_cost_usd >= budget.max_cost_usd) return true;
  return false;
}

/**
 * Walk the scores array end-to-start. Count consecutive iterations where
 * pass_rate dropped vs the prior iteration. Stops at the first iteration
 * that did NOT degrade.
 */
export function consecutiveDegradations(
  scores: ReadonlyArray<EvalIterationScore>,
): number {
  if (scores.length < 2) return 0;
  let count = 0;
  for (let i = scores.length - 1; i > 0; i--) {
    const cur = scores[i];
    const prev = scores[i - 1];
    if (!cur || !prev) break;
    if (cur.pass_rate < prev.pass_rate) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Cost estimator ───────────────────────────────────────────────────

export interface EstimateCostInput {
  readonly tasks: number;
  readonly iterations: number;
  readonly specialists_per_run: number;
  /** USD per LLM call (rough average across agent + judge + reflector). */
  readonly cost_per_call_usd: number;
}

/**
 * Pre-flight estimator per spec §cost-tracking. Returns an
 * EvalCostEstimate the runner compares against the budget before
 * starting iteration N.
 */
export function estimateCost(input: EstimateCostInput): EvalCostEstimate {
  const { tasks, iterations, specialists_per_run, cost_per_call_usd } = input;
  const agent_calls = tasks * iterations * Math.max(1, specialists_per_run);
  const judge_calls = tasks * iterations;
  const reflector_calls = Math.max(0, iterations - 1);
  const total_llm_calls = agent_calls + judge_calls + reflector_calls;
  const estimated_cost_usd = total_llm_calls * cost_per_call_usd;
  return {
    agent_calls,
    judge_calls,
    reflector_calls,
    total_llm_calls,
    estimated_cost_usd,
  };
}

/** True iff a `cost` estimate would fit in `budget` with at least one call to spare. */
export function withinBudget(cost: EvalCostEstimate, budget: EvalBudget): boolean {
  return !exceedsBudget(cost, budget);
}
