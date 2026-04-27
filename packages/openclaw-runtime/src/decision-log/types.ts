/**
 * Decision log types.
 *
 * Implements: docs/spec/openclaw-v1/005-decision-log.md
 *
 * The decision log is the structured audit trail. Every meaningful runtime
 * action emits a typed entry. Mirror's spec section 005 verbatim — the type
 * union below is the canonical DecisionType enum from the spec.
 */

// ─── DecisionType ──────────────────────────────────────────────────────

export type DecisionType =
  // Lifecycle
  | "session_start"
  | "session_end"
  | "stage_transition"
  | "turn_start"
  | "turn_end"
  // Tool execution
  | "tool_selection"
  | "tool_execution_start"
  | "tool_execution_end"
  | "permission_denied"
  | "permission_approved"
  // Errors and recovery
  | "error_classified"
  | "retry_decided"
  | "recovery_applied"
  // Memory
  | "memory_read"
  | "memory_write_proposed"
  | "memory_write_routed"
  | "memory_write_confirmed"
  | "memory_write_rejected"
  | "compaction"
  // Composition
  | "sub_agent_spawn"
  | "sub_agent_complete"
  | "result_merge"
  | "orchestrator_handoff"
  // Output validation
  | "output_validation_passed"
  | "output_validation_failed"
  | "parser_fallback"
  // Verification + eval
  | "verification_check_run"
  | "verification_fix_attempted"
  | "eval_task_run"
  | "eval_iteration"
  // Config
  | "config_commit"
  // Hooks
  | "hook_fired"
  | "hook_failed"
  // Checkpoint
  | "checkpoint_created"
  | "checkpoint_resumed"
  | "checkpoint_drift_detected"
  // Milestones (since spec section 016)
  | "milestone_classification"
  | "milestone_reclassification"
  | "milestone_autonomy_evaluated"
  | "milestone_evaluated"
  | "milestone_missed"
  | "milestone_signoff_recorded"
  | "milestone_exit_ramp_triggered"
  // Custom (pipeline-defined)
  | "custom";

/**
 * Every canonical type in one list — useful for validation and iteration.
 */
export const DECISION_TYPES: ReadonlyArray<DecisionType> = [
  "session_start",
  "session_end",
  "stage_transition",
  "turn_start",
  "turn_end",
  "tool_selection",
  "tool_execution_start",
  "tool_execution_end",
  "permission_denied",
  "permission_approved",
  "error_classified",
  "retry_decided",
  "recovery_applied",
  "memory_read",
  "memory_write_proposed",
  "memory_write_routed",
  "memory_write_confirmed",
  "memory_write_rejected",
  "compaction",
  "sub_agent_spawn",
  "sub_agent_complete",
  "result_merge",
  "orchestrator_handoff",
  "output_validation_passed",
  "output_validation_failed",
  "parser_fallback",
  "verification_check_run",
  "verification_fix_attempted",
  "eval_task_run",
  "eval_iteration",
  "config_commit",
  "hook_fired",
  "hook_failed",
  "checkpoint_created",
  "checkpoint_resumed",
  "checkpoint_drift_detected",
  "milestone_classification",
  "milestone_reclassification",
  "milestone_autonomy_evaluated",
  "milestone_evaluated",
  "milestone_missed",
  "milestone_signoff_recorded",
  "milestone_exit_ramp_triggered",
  "custom",
];

// ─── Decision shape ────────────────────────────────────────────────────

export interface Decision {
  /** ULID — sortable, globally unique. */
  readonly id: string;
  readonly pipeline_id: string;
  readonly agent_id: string;
  readonly session_id: string;
  /** Parent decision (call-tree reconstruction). */
  readonly parent_id?: string;
  readonly type: DecisionType;
  /** ISO-8601 UTC. */
  readonly timestamp: string;
  /** One-line human-readable summary. */
  readonly description: string;
  /** Type-specific shape. Pipelines may bind a JSON Schema per type for runtime validation (see DecisionMetadataSchemaBinding). */
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly spec_version: string;
}

/**
 * Input to the decision log writer. The runtime fills in id, timestamp,
 * pipeline_id, agent_id, session_id, parent_id, and spec_version from
 * execution context — callers supply only the type, description, metadata.
 */
export interface DecisionInput {
  readonly type: DecisionType;
  readonly description: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Override automatic parent derivation (rare). */
  readonly parent_id?: string;
}

// ─── DecisionMetric ───────────────────────────────────────────────────

export interface DecisionMetric {
  readonly pipeline_id: string;
  readonly agent_id: string;
  readonly session_id?: string;
  /** Dot-separated name, e.g. "tool_execution.latency_ms". */
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: string;
  /** Cardinality-bounded labels. Avoid per-user / per-session as labels — they belong in (agent_id, session_id). */
  readonly labels?: Readonly<Record<string, string>>;
}

export interface DecisionMetricInput {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly labels?: Readonly<Record<string, string>>;
}

// ─── Query ────────────────────────────────────────────────────────────

export interface DecisionLogQuery {
  readonly pipeline_id: string;
  readonly agent_id?: string;
  readonly session_id?: string;
  readonly types?: ReadonlyArray<DecisionType>;
  /** Inclusive lower bound, ISO-8601. */
  readonly since?: string;
  /** Exclusive upper bound, ISO-8601. */
  readonly until?: string;
  readonly parent_id?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface DecisionLogResult {
  readonly entries: ReadonlyArray<Decision>;
  readonly next_cursor?: string;
  readonly total_count: number;
}

// ─── Storage adapter (extension point) ────────────────────────────────

/**
 * The runtime substrate ships with an in-memory adapter. Production deploys
 * supply a Postgres adapter; the openclaw-runtime package does not depend
 * on Postgres directly — concrete adapters live in ruh-backend or as
 * separate packages.
 */
export interface DecisionStoreAdapter {
  write(decision: Decision): Promise<void>;
  writeMetric(metric: DecisionMetric): Promise<void>;
  query(q: DecisionLogQuery): Promise<DecisionLogResult>;
}
