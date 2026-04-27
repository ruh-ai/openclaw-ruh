/**
 * Sub-agent isolation — types.
 *
 * Implements: docs/spec/openclaw-v1/007-sub-agent.md
 * Mirrors:    docs/spec/openclaw-v1/schemas/sub-agent.schema.json
 *
 * A sub-agent is a specialist the orchestrator spawns. The substrate
 * defines the shapes + the lexical workspace-scope validator + the
 * conflict-detection / merge-result builder. Realpath / symlink /
 * cross-device checks belong to the filesystem layer (a concrete
 * adapter); the substrate ships the lexical-safety rules every adapter
 * must enforce on top.
 *
 * Substrate scope:
 *   - SubAgentConfig + SubAgent shapes
 *   - SubAgentStatus state machine
 *   - SubAgentResult return contract
 *   - MergeResult aggregate (built from N completed sub-agent results)
 *   - agent-uri.ts: openclaw:// URI build/parse
 *   - workspace-scope.ts: lexical path-safety (rules 1-3 + scope containment)
 *   - merge.ts: detectFileConflicts + buildMergeResult
 *
 * Out of scope:
 *   - Session management runtime (allocating gateway sessions, threading
 *     state across orchestrator/specialist). That's Phase 2c.
 *   - Filesystem-layer enforcement (realpath, O_NOFOLLOW, atomic-rename
 *     writes, write-during-merge locks). Adapter responsibility.
 */

import type {
  FileConflict,
  HandoffContext,
} from "../orchestrator/types";

// ─── SubAgentStatus ────────────────────────────────────────────────────

export type SubAgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "skipped";

export const SUB_AGENT_STATUSES: ReadonlyArray<SubAgentStatus> = [
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
  "skipped",
];

/** Terminal states — sub-agent will not transition out. */
export const TERMINAL_SUB_AGENT_STATUSES: ReadonlyArray<SubAgentStatus> = [
  "completed",
  "failed",
  "stopped",
  "skipped",
];

export function isTerminalStatus(status: SubAgentStatus): boolean {
  return TERMINAL_SUB_AGENT_STATUSES.includes(status);
}

// ─── SubAgentConfig + SubAgent ────────────────────────────────────────

export interface SubAgentConfig {
  readonly specialist: string;
  readonly parent_session_id: string;
  /** ULID of the orchestrator decision that spawned this sub-agent. */
  readonly parent_decision_id: string;
  readonly workspace_scope: string;
  readonly context: HandoffContext;
}

export interface SubAgent {
  /** ULID — unique across the pipeline. */
  readonly id: string;
  readonly specialist: string;
  /** `openclaw://<pipeline>/agents/<specialist>@<version>` */
  readonly agent_uri: string;
  /** Sub-agent's own session, distinct from the orchestrator's. */
  readonly session_id: string;
  /** Shared with parent — logical isolation, not physical. */
  readonly sandbox_id: string;
  readonly workspace_scope: string;
  readonly status: SubAgentStatus;
  readonly created_at: string;
  readonly completed_at?: string;
  readonly result?: SubAgentResult;
  readonly parent_session_id: string;
  readonly parent_decision_id: string;
}

// ─── SubAgentResult ───────────────────────────────────────────────────

export interface SubAgentPartialCompletion {
  readonly completed_steps: ReadonlyArray<string>;
  readonly pending_steps: ReadonlyArray<string>;
}

export interface SubAgentResult {
  readonly success: boolean;
  /** Workspace-relative paths. */
  readonly files_written: ReadonlyArray<string>;
  /** ≤500 chars; surfaced to orchestrator + dashboard. */
  readonly output_summary: string;
  readonly emitted_events: ReadonlyArray<unknown>;
  readonly decision_count: number;
  readonly error?: string;
  /** Free-form ErrorCategory string from spec 014; substrate doesn't bind to enum here. */
  readonly error_category?: string;
  readonly partial_completion?: SubAgentPartialCompletion;
}

// ─── MergeResult — aggregate over N completed sub-agents ──────────────

export interface MergeAgentSummary {
  readonly specialist: string;
  readonly success: boolean;
  readonly files_written: number;
  readonly output_summary: string;
}

export interface MergeResult {
  /** True iff every required sub-agent succeeded. */
  readonly success: boolean;
  /** Unique paths across all sub-agents (deduplicated). */
  readonly total_files: number;
  readonly conflicts: ReadonlyArray<FileConflict>;
  readonly agent_results: ReadonlyArray<MergeAgentSummary>;
  /** Some succeeded, some failed. */
  readonly partial_completion: boolean;
  readonly failed_required?: ReadonlyArray<string>;
  readonly failed_optional?: ReadonlyArray<string>;
}

// ─── Spawn / merge inputs (callable by orchestrator runtime) ──────────

/**
 * One completed sub-agent's contribution to a merge. The orchestrator
 * (Phase 2c) collects these and calls `buildMergeResult`.
 */
export interface SubAgentCompletion {
  readonly specialist: string;
  readonly required: boolean;
  readonly result: SubAgentResult;
}

// Re-export FileConflict from orchestrator since it's referenced here too.
export type { FileConflict };
