/**
 * Eval task and convergence loop — types.
 *
 * Implements: docs/spec/openclaw-v1/008-eval-task.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/eval-task.schema.json
 *
 * Substrate scope (Phase 2c):
 *   - EvalTask + EvalSuite + EvalJudge + EvalRubric shapes
 *   - ConvergenceLoopConfig + EvalLoopState + SkillMutation shapes
 *   - Pure deterministic scoring helpers (exact, structural, composite)
 *   - Stop-condition evaluator over an EvalLoopState history
 *   - Cost estimator for budget enforcement
 *
 * Out of scope (deferred to runtime):
 *   - The LLM judge call (semantic kind requires invoking the judge
 *     model; that's pipeline runtime, not substrate)
 *   - The pipeline-runner that actually executes the agent against tasks
 *   - The reflector specialist that produces SkillMutation proposals
 *   - Filesystem-layer skill-file rewriting (mutation application)
 */

// ─── Status + sources ─────────────────────────────────────────────────

export type EvalStatus = "pending" | "running" | "pass" | "fail" | "manual" | "error";

export const EVAL_STATUSES: ReadonlyArray<EvalStatus> = [
  "pending",
  "running",
  "pass",
  "fail",
  "manual",
  "error",
];

export type EvalTaskSource =
  | { readonly kind: "synthetic"; readonly author: string }
  | {
      readonly kind: "historical";
      readonly pipeline_id: string;
      readonly original_session_id: string;
    }
  | {
      readonly kind: "customer-curated";
      readonly customer: string;
      readonly reference: string;
    };

// ─── Input + expected ─────────────────────────────────────────────────

export interface EvalTaskInputFile {
  readonly path: string;
  /** Path within the suite's `fixtures/` directory. */
  readonly content_ref: string;
}

export interface EvalTaskInput {
  readonly user_message?: string;
  readonly files?: ReadonlyArray<EvalTaskInputFile>;
  readonly initial_state?: Readonly<Record<string, unknown>>;
}

export interface EvalExpectedFile {
  readonly path: string;
  /** Exact-match expected content (path within fixtures/). */
  readonly content_ref?: string;
  /** Partial structural match (e.g., JSON Schema-shaped expectations). */
  readonly structural_match?: Readonly<Record<string, unknown>>;
  /** Description for a semantic judge to evaluate against. */
  readonly semantic_match?: string;
}

export interface EvalExpectedDecision {
  /** DecisionType from spec 005 (substrate keeps this loose; runtime narrows). */
  readonly type: string;
  readonly metadata_constraints?: Readonly<Record<string, unknown>>;
}

export interface EvalTaskExpected {
  readonly output_summary?: string;
  readonly files_written?: ReadonlyArray<EvalExpectedFile>;
  readonly decisions?: ReadonlyArray<EvalExpectedDecision>;
  readonly must_call_tools?: ReadonlyArray<string>;
  readonly must_not_call_tools?: ReadonlyArray<string>;
}

// ─── Judge + rubric ───────────────────────────────────────────────────

export type EvalJudgeKind = "exact" | "structural" | "semantic" | "composite";

export interface EvalRubricDimension {
  readonly name: string;
  readonly description: string;
  readonly scale: { readonly min: number; readonly max: number };
  /** Numeric tolerance (percent) for quantity-style dimensions. */
  readonly tolerance_percent?: number;
}

export interface EvalRubric {
  readonly dimensions: ReadonlyArray<EvalRubricDimension>;
  readonly pass_threshold: number;
}

export interface EvalJudge {
  readonly kind: EvalJudgeKind;
  readonly prompt?: string;
  readonly rubric?: EvalRubric;
  /** Composite weights keyed by sub-judge dimension or sub-judge index label. */
  readonly weights?: Readonly<Record<string, number>>;
  readonly sub_judges?: ReadonlyArray<EvalJudge>;
}

// ─── Eval task + suite ────────────────────────────────────────────────

export interface EvalDelta {
  readonly kind?: string;
  readonly path?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

export interface EvalTask {
  readonly id: string;
  readonly spec_version: string;
  readonly name: string;
  readonly description: string;
  readonly source: EvalTaskSource;
  readonly input: EvalTaskInput;
  readonly expected: EvalTaskExpected;
  readonly judge: EvalJudge;
  readonly acceptance_threshold: number;
  readonly status?: EvalStatus;
  readonly confidence?: number;
  readonly iteration?: number;
  readonly deltas?: ReadonlyArray<EvalDelta>;
}

export interface EvalSuite {
  readonly spec_version: string;
  readonly pipeline_id: string;
  readonly name: string;
  readonly description: string;
  readonly tasks: ReadonlyArray<EvalTask>;
  readonly judge_model: string;
  readonly pass_rate_threshold: number;
}

// ─── Convergence loop ─────────────────────────────────────────────────

export interface EvalBudget {
  readonly max_llm_calls: number;
  readonly max_cost_usd: number;
}

export interface ConvergenceLoopConfig {
  readonly max_iterations: number;
  readonly max_consecutive_degradations: number;
  readonly reload_pause_ms: number;
  readonly pass_rate_threshold: number;
  readonly budget: EvalBudget;
}

export interface EvalIterationScore {
  readonly iteration: number;
  /** 0..1 fraction of tasks passing this iteration. */
  readonly pass_rate: number;
  /** Average judge confidence across tasks; scale depends on judge. */
  readonly avg_score: number;
}

export type SkillRewriteKind =
  | "section_replace"
  | "section_append"
  | "frontmatter_update";

export interface SkillMutation {
  readonly skill_id: string;
  readonly iteration: number;
  readonly rewrite_kind: SkillRewriteKind;
  readonly target_section?: string;
  readonly new_content: string;
  readonly accepted?: boolean;
  readonly reverted_at?: string;
}

export interface EvalCostEstimate {
  readonly agent_calls: number;
  readonly judge_calls: number;
  readonly reflector_calls: number;
  readonly total_llm_calls: number;
  readonly estimated_cost_usd: number;
}

export type EvalLoopStatus = "running" | "completed" | "degraded" | "aborted";

export type EvalStopReason =
  | "all_passed"
  | "max_iterations"
  | "degraded"
  | "no_actionable_changes"
  | "mutation_failed"
  | "budget_exhausted"
  | "aborted";

export const EVAL_STOP_REASONS: ReadonlyArray<EvalStopReason> = [
  "all_passed",
  "max_iterations",
  "degraded",
  "no_actionable_changes",
  "mutation_failed",
  "budget_exhausted",
  "aborted",
];

export interface EvalLoopState {
  readonly iteration: number;
  readonly max_iterations: number;
  readonly scores: ReadonlyArray<EvalIterationScore>;
  readonly mutations: ReadonlyArray<SkillMutation>;
  readonly cost?: EvalCostEstimate;
  readonly status: EvalLoopStatus;
  readonly stop_reason?: EvalStopReason;
}

// ─── Reflector ────────────────────────────────────────────────────────

export interface SkillRewrite {
  readonly skill_id: string;
  readonly rewrite_kind: SkillRewriteKind;
  readonly target_section?: string;
  readonly new_content: string;
}

export interface ReflectorOutput {
  readonly rewrites: ReadonlyArray<SkillRewrite>;
  readonly reasoning: string;
  /** 0..1 confidence in the proposed mutations. */
  readonly confidence: number;
}
