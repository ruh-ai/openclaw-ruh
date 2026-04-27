/**
 * Checkpoint facade.
 *
 * Implements the substrate slice of spec 012. Owns the API skills and
 * orchestrators call:
 *
 *   - create(input)            — fills identity + persists + emits checkpoint_created
 *   - get(id)                  — by id
 *   - latest(opts)             — newest unretired for (pipeline,agent,session)
 *   - query(filter)            — for dashboards / audit
 *   - retire(id, reason?)      — soft-delete; runtime sweeps later
 *   - resumeFrom(input)        — runs the three resume preconditions and
 *                                emits checkpoint_resumed OR
 *                                checkpoint_drift_detected
 *
 * Resume precondition order (per spec §lifecycle - resume):
 *   1. Checkpoint exists + not retired
 *   2. expires_at > now
 *   3. workspace_checksum matches
 *   4. spec_version is compatible (semver minor-or-patch match)
 *
 * The substrate doesn't compute workspace checksums (filesystem layer
 * does, passes the value in) and doesn't run the periodic cleanup (the
 * orchestrator runs that on a cron). It just enforces the contract.
 */

import type { DecisionLog } from "../decision-log/log";
import { ulid } from "../decision-log/log";
import { CheckpointSchema } from "./schemas";
import type {
  Checkpoint,
  CheckpointInput,
  CheckpointQuery,
  CheckpointStoreAdapter,
  ResumeInput,
  ResumeOutcome,
  ResumeRejectReason,
} from "./types";

// ─── TTL bounds ───────────────────────────────────────────────────────

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Errors ───────────────────────────────────────────────────────────

export class CheckpointNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`checkpoint "${id}" not found`);
    this.name = "CheckpointNotFoundError";
  }
}

// ─── Options ──────────────────────────────────────────────────────────

export interface CheckpointStoreOptions {
  readonly pipelineId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly specVersion: string;
  readonly store: CheckpointStoreAdapter;
  /** Default 4h. Override per pipeline (≤7d). */
  readonly defaultTtlMs?: number;
  /** Test seam — override Date.now for deterministic ids/timestamps. */
  readonly now?: () => number;
  /** Test seam — override randomness for ULID generation. */
  readonly random?: () => number;
  readonly decisionLog?: DecisionLog;
}

// ─── CheckpointStore ──────────────────────────────────────────────────

export class CheckpointStore {
  readonly #opts: CheckpointStoreOptions;

  constructor(opts: CheckpointStoreOptions) {
    this.#opts = opts;
  }

  /**
   * Persist a snapshot. Fills identity (ULID id, pipeline/agent/session/
   * spec_version), timestamps (created_at, expires_at), and validates the
   * resulting checkpoint against CheckpointSchema before persisting.
   */
  async create(input: CheckpointInput): Promise<Checkpoint> {
    const nowMs = (this.#opts.now ?? Date.now)();
    const random = this.#opts.random ?? Math.random;
    const ttl = clampTtl(input.ttl_ms ?? this.#opts.defaultTtlMs ?? FOUR_HOURS_MS);
    const id = ulid(nowMs, random);

    const checkpoint: Checkpoint = {
      id,
      spec_version: this.#opts.specVersion,
      pipeline_id: this.#opts.pipelineId,
      agent_id: this.#opts.agentId,
      session_id: this.#opts.sessionId,
      ...(input.parent_checkpoint_id !== undefined
        ? { parent_checkpoint_id: input.parent_checkpoint_id }
        : {}),

      dev_stage: input.dev_stage,
      created_at: new Date(nowMs).toISOString(),
      expires_at: new Date(nowMs + ttl).toISOString(),

      copilot_state: input.copilot_state,
      build_manifest: input.build_manifest,

      conversation_summary: input.conversation_summary,
      conversation_tokens_estimate: input.conversation_tokens_estimate,
      ...(input.active_skill_id !== undefined
        ? { active_skill_id: input.active_skill_id }
        : {}),
      ...(input.active_tool_execution_id !== undefined
        ? { active_tool_execution_id: input.active_tool_execution_id }
        : {}),

      files_written: input.files_written,
      files_pending: input.files_pending,
      workspace_checksum: input.workspace_checksum,

      sub_agents: input.sub_agents,
      ...(input.verification_progress !== undefined
        ? { verification_progress: input.verification_progress }
        : {}),
      ...(input.eval_loop_progress !== undefined
        ? { eval_loop_progress: input.eval_loop_progress }
        : {}),

      reason: input.reason,
    };

    // Validate before we hit the store. Errors here mean the caller built
    // a malformed input — surfacing via Zod is more useful than letting it
    // land downstream.
    CheckpointSchema.parse(checkpoint);

    await this.#opts.store.put(checkpoint);

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "checkpoint_created",
        description: `checkpoint ${id} (${input.reason})`,
        metadata: {
          checkpoint_id: id,
          reason: input.reason,
          dev_stage: input.dev_stage,
          parent_checkpoint_id: input.parent_checkpoint_id ?? null,
          expires_at: checkpoint.expires_at,
          conversation_tokens_estimate: input.conversation_tokens_estimate,
        },
      });
    }

    return checkpoint;
  }

  async get(id: string): Promise<Checkpoint | undefined> {
    return this.#opts.store.get(id);
  }

  async latest(opts?: {
    pipeline_id?: string;
    agent_id?: string;
    session_id?: string;
  }): Promise<Checkpoint | undefined> {
    return this.#opts.store.latest({
      pipeline_id: opts?.pipeline_id ?? this.#opts.pipelineId,
      agent_id: opts?.agent_id ?? this.#opts.agentId,
      session_id: opts?.session_id ?? this.#opts.sessionId,
    });
  }

  async query(q: Omit<CheckpointQuery, "pipeline_id"> & { pipeline_id?: string } = {}): Promise<
    ReadonlyArray<Checkpoint>
  > {
    return this.#opts.store.query({
      pipeline_id: q.pipeline_id ?? this.#opts.pipelineId,
      ...(q.agent_id !== undefined ? { agent_id: q.agent_id } : {}),
      ...(q.session_id !== undefined ? { session_id: q.session_id } : {}),
      ...(q.since !== undefined ? { since: q.since } : {}),
      ...(q.until !== undefined ? { until: q.until } : {}),
      ...(q.include_retired !== undefined ? { include_retired: q.include_retired } : {}),
      ...(q.limit !== undefined ? { limit: q.limit } : {}),
    });
  }

  async retire(id: string): Promise<void> {
    const exists = await this.#opts.store.get(id);
    if (!exists) throw new CheckpointNotFoundError(id);
    const now = new Date((this.#opts.now ?? Date.now)()).toISOString();
    await this.#opts.store.retire(id, now);
  }

  /**
   * Apply the resume preconditions per spec §resume. Returns either a
   * successful resume (with the checkpoint) or a typed reject. Emits a
   * decision-log entry in either case so the audit trail records why a
   * resume was attempted and what happened.
   */
  async resumeFrom(input: ResumeInput): Promise<ResumeOutcome> {
    const stored = await this.#opts.store.get(input.checkpoint_id);
    if (!stored) {
      await this.#emitDriftIfPresent(input.checkpoint_id, "not_found", {});
      return { outcome: "reject", reason: "not_found", checkpoint_id: input.checkpoint_id };
    }

    if (await this.#opts.store.isRetired(input.checkpoint_id)) {
      await this.#emitDriftIfPresent(input.checkpoint_id, "retired", {});
      return { outcome: "reject", reason: "retired", checkpoint_id: input.checkpoint_id };
    }

    const nowMs = input.now ?? (this.#opts.now ?? Date.now)();
    const nowIso = new Date(nowMs).toISOString();
    if (nowIso >= stored.expires_at) {
      await this.#emitDriftIfPresent(input.checkpoint_id, "expired", {
        expires_at: stored.expires_at,
        now: nowIso,
      });
      return { outcome: "reject", reason: "expired", checkpoint_id: input.checkpoint_id };
    }

    if (input.current_workspace_checksum !== stored.workspace_checksum) {
      await this.#emitDriftIfPresent(input.checkpoint_id, "workspace_drift", {
        checkpoint_checksum: stored.workspace_checksum,
        current_checksum: input.current_workspace_checksum,
      });
      return {
        outcome: "reject",
        reason: "workspace_drift",
        checkpoint_id: input.checkpoint_id,
        details: {
          checkpoint_checksum: stored.workspace_checksum,
          current_checksum: input.current_workspace_checksum,
        },
      };
    }

    if (!isSpecVersionCompatible(stored.spec_version, input.current_spec_version)) {
      await this.#emitDriftIfPresent(input.checkpoint_id, "spec_version_drift", {
        checkpoint_spec_version: stored.spec_version,
        current_spec_version: input.current_spec_version,
      });
      return {
        outcome: "reject",
        reason: "spec_version_drift",
        checkpoint_id: input.checkpoint_id,
        details: {
          checkpoint_spec_version: stored.spec_version,
          current_spec_version: input.current_spec_version,
        },
      };
    }

    if (this.#opts.decisionLog) {
      await this.#opts.decisionLog.emit({
        type: "checkpoint_resumed",
        description: `resumed from ${input.checkpoint_id}`,
        metadata: {
          checkpoint_id: input.checkpoint_id,
          dev_stage: stored.dev_stage,
          reason: stored.reason,
          conversation_tokens_estimate: stored.conversation_tokens_estimate,
        },
      });
    }
    return { outcome: "resume", checkpoint: stored };
  }

  async #emitDriftIfPresent(
    checkpoint_id: string,
    reason: ResumeRejectReason,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.#opts.decisionLog) return;
    await this.#opts.decisionLog.emit({
      type: "checkpoint_drift_detected",
      description: `resume from ${checkpoint_id} rejected — ${reason}`,
      metadata: {
        checkpoint_id,
        reason,
        ...details,
      },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Per spec, default TTL is 4h, configurable per pipeline up to 7d.
 * We clamp negatives to 0 (immediately-expired snapshots are rejected on
 * resume — useful for deterministic tests).
 */
function clampTtl(ttl_ms: number): number {
  if (!Number.isFinite(ttl_ms)) return FOUR_HOURS_MS;
  if (ttl_ms < 0) return 0;
  if (ttl_ms > SEVEN_DAYS_MS) return SEVEN_DAYS_MS;
  return ttl_ms;
}

/**
 * Compatibility check for resume per spec 100 §versioning.
 *
 * Minor versions are additive within a major: a newer-minor runtime can
 * read older-minor checkpoints (forward compatibility). The reverse —
 * an older-minor runtime reading a newer-minor checkpoint — is rejected
 * because the checkpoint may carry fields the runtime doesn't know how
 * to interpret. Major-version differences are always rejected.
 *
 * Patch and prerelease differences are always compatible.
 *
 *  checkpoint = 1.0.0, current = 1.0.5  → true  (same minor, patch newer)
 *  checkpoint = 1.0.0, current = 1.1.0  → true  (current minor newer)
 *  checkpoint = 1.1.0, current = 1.0.0  → false (current minor older)
 *  checkpoint = 1.0.0, current = 2.0.0  → false (major differs)
 */
export function isSpecVersionCompatible(
  checkpointVersion: string,
  currentVersion: string,
): boolean {
  const cp = parseSemver(checkpointVersion);
  const cur = parseSemver(currentVersion);
  if (!cp || !cur) return false;
  if (cp.major !== cur.major) return false;
  // Forward compat only: current must be >= checkpoint at minor.
  if (cur.minor < cp.minor) return false;
  return true;
}

function parseSemver(
  v: string,
): { major: number; minor: number; patch: number } | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z0-9.]+)?$/.exec(v);
  if (!m) return undefined;
  const major = m[1];
  const minor = m[2];
  const patch = m[3];
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}
