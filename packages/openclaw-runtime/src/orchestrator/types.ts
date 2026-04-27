/**
 * Orchestrator protocol — types.
 *
 * Implements: docs/spec/openclaw-v1/006-orchestrator.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/orchestrator.schema.json
 *
 * Substrate scope (Phase 2a):
 *   - Manifest-bound shapes (OrchestratorRef, RoutingRules, RoutingRule,
 *     MatchClause, FanOutSpec, FailurePolicy, MergePolicyRule)
 *   - Runtime hand-off / result shapes (OrchestratorHandoff, HandoffContext,
 *     OrchestratorResult, FileConflict, MergedResponse)
 *   - Pure routing-matcher input/output types (in routing.ts)
 *
 * Out of scope (deferred to Phase 2c — runtime orchestrator):
 *   - Spawning specialist sessions (depends on Phase 2b sub-agent module)
 *   - Sequential / parallel / fan-out execution
 *   - Result merger applying merge_policy to a workspace
 *   - LLM-mediated routing fallback
 *
 * The substrate Phase 2a delivers the shapes + the deterministic matcher
 * functions that any orchestrator runtime will consult. The runtime that
 * actually drives sessions builds on top in 2c.
 */

// ─── OrchestratorRef ──────────────────────────────────────────────────

export interface OrchestratorRef {
  /** kebab-case agent id; must match an entry in pipeline.agents[]. */
  readonly agent_id: string;
  /** Skills the orchestrator exposes as pipeline entry points. */
  readonly skills: ReadonlyArray<string>;
}

// ─── RoutingRules + RoutingRule ───────────────────────────────────────

export interface RoutingRules {
  readonly rules: ReadonlyArray<RoutingRule>;
  /** Specialist or skill to invoke when no rule matches. */
  readonly fallback: string;
  /**
   * Default max parallelism for fan-out specs that don't declare one.
   * Spec 006 §anti-example pins 4 as the conservative default; the schema
   * accepts 1..32. Set per pipeline; absent = runtime falls back to 4.
   */
  readonly fan_out_default_max_parallelism?: number;
}

/**
 * One declarative routing rule. A rule must specify exactly one of
 * `specialist` (single specialist), `specialists` (sequential list),
 * or `fan_out` (parallel batch).
 */
export interface RoutingRule {
  readonly match: MatchClause;
  readonly specialist?: string;
  readonly specialists?: ReadonlyArray<string>;
  readonly fan_out?: FanOutSpec;
  /** Specialist to run after this rule's specialist(s) complete. */
  readonly then?: string;
  /** Extra context passed in the handoff (e.g. `config_filter`). */
  readonly context?: Readonly<Record<string, unknown>>;
  /** Higher priority wins on ties. Default 0. */
  readonly priority?: number;
}

// ─── MatchClause ──────────────────────────────────────────────────────

/**
 * Match shape per spec §match-clauses. The substrate evaluates these
 * against a `MatchContext` snapshot of pipeline state. Pipelines may add
 * additional fields the substrate doesn't recognise — those are passed
 * to a registered `custom` matcher rather than ignored.
 */
export interface MatchClause {
  readonly stage?: string;
  readonly message_kind?: string;
  /** Input has ALL of these — subset semantics. */
  readonly input_has?: ReadonlyArray<string>;
  readonly regions?: ReadonlyArray<string>;
  /** Per-specialist status map (e.g., `{ "intake-specialist": "completed" }`). */
  readonly agent_status?: Readonly<Record<string, MatchAgentStatus>>;
  /** Comparison map: `{ "<": 100 }`, `{ ">=": 5 }`, etc. Sparse — pipelines typically declare one or two comparators. */
  readonly decision_count?: Readonly<Partial<Record<MatchComparison, number>>>;
  /** Reference to a pipeline-supplied matcher module. */
  readonly custom?: string;
}

export type MatchAgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "skipped";

export type MatchComparison = "<" | "<=" | "==" | "!=" | ">=" | ">";

// ─── FanOutSpec ────────────────────────────────────────────────────────

export interface FanOutSpec {
  readonly specialist: string;
  /** Reference to a pipeline-supplied function that produces input chunks. */
  readonly split_input: string;
  /** Concurrency cap. Falls back to RoutingRules.fan_out_default_max_parallelism, then 4. */
  readonly max_parallelism?: number;
}

// ─── FailurePolicy ────────────────────────────────────────────────────

export type FailurePolicy =
  | "abort"
  | "skip"
  | "retry-then-escalate"
  | "retry-then-skip"
  | "manual-review";

export const FAILURE_POLICIES: ReadonlyArray<FailurePolicy> = [
  "abort",
  "skip",
  "retry-then-escalate",
  "retry-then-skip",
  "manual-review",
];

/** The runtime default per spec 006 §failure-handling. */
export const DEFAULT_FAILURE_POLICY: FailurePolicy = "retry-then-escalate";

// ─── MergePolicyRule ──────────────────────────────────────────────────

export type MergeResolution = "last-write-wins" | "explicit-merge" | "error";

export interface MergePolicyRule {
  /** Glob: `*` = single segment, `**` = any depth, literal otherwise. */
  readonly path_glob: string;
  readonly resolution: MergeResolution;
}

// ─── Handoff + result shapes ──────────────────────────────────────────

export interface HandoffContext {
  readonly user_message?: string;
  readonly upstream_results?: Readonly<Record<string, unknown>>;
  readonly config_filter?: Readonly<Record<string, unknown>>;
  readonly memory_lanes?: ReadonlyArray<string>;
  /** Workspace-relative path the specialist may write to. Required. */
  readonly workspace_scope: string;
  readonly deadline?: string;
}

export interface OrchestratorHandoff {
  readonly to_specialist: string;
  readonly context: HandoffContext;
  readonly parent_session_id: string;
  /** ULID of the parent decision (typically the orchestrator_handoff entry). */
  readonly parent_decision_id: string;
}

export interface OrchestratorResult {
  readonly specialist: string;
  readonly success: boolean;
  readonly files_written: ReadonlyArray<string>;
  readonly decision_log_entries: number;
  /** ≤200 chars summary surfaced to the user. */
  readonly output_summary: string;
  readonly emitted_events?: ReadonlyArray<unknown>;
  readonly error?: string;
}

export interface FileConflict {
  readonly path: string;
  readonly agents: ReadonlyArray<string>;
  readonly resolution: MergeResolution;
}

export interface MergedResponse {
  readonly user_message: string;
  readonly files_written: ReadonlyArray<string>;
  readonly conflicts: ReadonlyArray<FileConflict>;
  readonly follow_up_actions?: ReadonlyArray<{
    readonly label: string;
    readonly next_specialist: string;
    readonly context?: Readonly<Record<string, unknown>>;
  }>;
}
