/**
 * Checkpoint substrate — types.
 *
 * Implements: docs/spec/openclaw-v1/012-checkpoint.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/checkpoint.schema.json
 *
 * A checkpoint is a typed snapshot of an in-flight pipeline run that lets
 * the runtime resume after interruption (rate-limit windows, sandbox
 * restarts, multi-session work). Per spec, a checkpoint is a *coordinate*
 * in state space, not the state itself — small (5-50 KB), referencing
 * memory and config by version rather than embedding them.
 *
 * The substrate owns:
 *   - the shape (Checkpoint, BuildManifestTask, SubAgentSnapshot, …)
 *   - the CheckpointStore facade (create/get/latest/query/retire/resumeFrom)
 *   - decision-log emission for create/resume/drift
 *
 * It does NOT:
 *   - compute workspace_checksum (filesystem layer; passed in)
 *   - implement Postgres-backed storage (downstream package)
 *   - run periodic cleanup of expired entries (orchestrator)
 */

import type { AgentDevStage } from "../types/lifecycle";

// ─── Reason enum ──────────────────────────────────────────────────────

export type CheckpointReason =
  | "scheduled_interval"
  | "rate_limit_imminent"
  | "before_destructive_op"
  | "sub_agent_handoff"
  | "session_pause"
  | "manual"
  | "stage_transition";

export const CHECKPOINT_REASONS: ReadonlyArray<CheckpointReason> = [
  "scheduled_interval",
  "rate_limit_imminent",
  "before_destructive_op",
  "sub_agent_handoff",
  "session_pause",
  "manual",
  "stage_transition",
];

// ─── Build manifest + sub-agent snapshots ─────────────────────────────

export type BuildManifestStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "skipped";

export interface BuildManifestTask {
  readonly id: string;
  readonly specialist: string;
  readonly status: BuildManifestStatus;
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly error?: string;
}

export type SubAgentSnapshotStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export interface SubAgentSnapshot {
  readonly id: string;
  readonly specialist: string;
  readonly status: SubAgentSnapshotStatus;
  readonly sub_session_id?: string;
  readonly workspace_scope: string;
}

// ─── Verification + eval-loop progress ────────────────────────────────

export interface VerificationProgress {
  readonly checks_passed: ReadonlyArray<string>;
  readonly checks_failed: ReadonlyArray<string>;
  readonly iteration: number;
}

export interface EvalLoopProgress {
  readonly iteration: number;
  /** 0..1 */
  readonly pass_rate: number;
  readonly avg_score: number;
}

// ─── Checkpoint shape ─────────────────────────────────────────────────

export interface Checkpoint {
  // Identity
  readonly id: string;
  readonly spec_version: string;
  readonly pipeline_id: string;
  readonly agent_id: string;
  readonly session_id: string;
  readonly parent_checkpoint_id?: string;

  // Lifecycle
  readonly dev_stage: AgentDevStage;
  readonly created_at: string;
  readonly expires_at: string;

  // Copilot / orchestrator state
  readonly copilot_state: Readonly<Record<string, unknown>>;
  readonly build_manifest: ReadonlyArray<BuildManifestTask>;

  // Conversation context
  readonly conversation_summary: string;
  readonly conversation_tokens_estimate: number;
  readonly active_skill_id?: string;
  readonly active_tool_execution_id?: string;

  // Workspace state
  readonly files_written: ReadonlyArray<string>;
  readonly files_pending: ReadonlyArray<string>;
  /** Format: `sha256:<64-hex>` */
  readonly workspace_checksum: string;

  // Sub-agents
  readonly sub_agents: ReadonlyArray<SubAgentSnapshot>;

  // Optional progress trackers
  readonly verification_progress?: VerificationProgress;
  readonly eval_loop_progress?: EvalLoopProgress;

  readonly reason: CheckpointReason;
}

// ─── Caller-supplied input ────────────────────────────────────────────

/**
 * What `CheckpointStore.create()` accepts. Identity fields (`id`,
 * `pipeline_id`, `agent_id`, `session_id`, `spec_version`, `created_at`,
 * `expires_at`) are filled by the facade — callers supply the snapshot
 * itself plus the cause + parent chain.
 */
export interface CheckpointInput {
  readonly reason: CheckpointReason;
  readonly dev_stage: AgentDevStage;
  readonly parent_checkpoint_id?: string;

  readonly copilot_state: Readonly<Record<string, unknown>>;
  readonly build_manifest: ReadonlyArray<BuildManifestTask>;
  readonly conversation_summary: string;
  readonly conversation_tokens_estimate: number;
  readonly active_skill_id?: string;
  readonly active_tool_execution_id?: string;
  readonly files_written: ReadonlyArray<string>;
  readonly files_pending: ReadonlyArray<string>;
  readonly workspace_checksum: string;
  readonly sub_agents: ReadonlyArray<SubAgentSnapshot>;
  readonly verification_progress?: VerificationProgress;
  readonly eval_loop_progress?: EvalLoopProgress;

  /** Override default TTL (ms). Default 4h; clamped to ≤ 7d (per spec retention). */
  readonly ttl_ms?: number;
}

// ─── Resume contract ──────────────────────────────────────────────────

/**
 * Inputs the runtime hands to `resumeFrom`. The substrate doesn't compute
 * workspace_checksum or current_spec_version — the runtime layer does and
 * passes them in.
 */
export interface ResumeInput {
  readonly checkpoint_id: string;
  readonly current_workspace_checksum: string;
  readonly current_spec_version: string;
  /** Optional override for "now" — defaults to Date.now(). Used to evaluate expires_at. */
  readonly now?: number;
}

export type ResumeRejectReason =
  | "not_found"
  | "expired"
  | "retired"
  | "workspace_drift"
  | "spec_version_drift";

export type ResumeOutcome =
  | { readonly outcome: "resume"; readonly checkpoint: Checkpoint }
  | {
      readonly outcome: "reject";
      readonly reason: ResumeRejectReason;
      readonly checkpoint_id: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

// ─── Query shape ──────────────────────────────────────────────────────

export interface CheckpointQuery {
  readonly pipeline_id: string;
  readonly agent_id?: string;
  readonly session_id?: string;
  readonly since?: string;
  readonly until?: string;
  readonly include_retired?: boolean;
  readonly limit?: number;
}

// ─── Storage adapter ──────────────────────────────────────────────────

export interface CheckpointStoreAdapter {
  put(checkpoint: Checkpoint): Promise<void>;
  get(id: string): Promise<Checkpoint | undefined>;
  /**
   * Latest unretired checkpoint for the given (pipeline_id, agent_id, session_id),
   * by created_at descending. Returns undefined if none.
   */
  latest(opts: {
    pipeline_id: string;
    agent_id: string;
    session_id: string;
  }): Promise<Checkpoint | undefined>;
  query(q: CheckpointQuery): Promise<ReadonlyArray<Checkpoint>>;
  retire(id: string, retired_at: string): Promise<void>;
  isRetired(id: string): Promise<boolean>;
}
