/**
 * Checkpoint substrate — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/checkpoint.schema.json. JSON Schema
 * is the canonical contract; these Zod schemas are the in-process
 * equivalents the substrate uses for runtime validation.
 */

import { z } from "zod";
import type { AgentDevStage } from "../types/lifecycle";
import type {
  BuildManifestStatus,
  BuildManifestTask,
  Checkpoint,
  CheckpointReason,
  EvalLoopProgress,
  SubAgentSnapshot,
  SubAgentSnapshotStatus,
  VerificationProgress,
} from "./types";

const ULID = /^[0-9A-Z]{26}$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;
const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

// ─── Enums ────────────────────────────────────────────────────────────

const _devStage: AgentDevStage[] = [
  "drafted",
  "validated",
  "tested",
  "shipped",
  "running",
  "paused",
  "archived",
];
export const AgentDevStageSchema = z.enum([
  "drafted",
  "validated",
  "tested",
  "shipped",
  "running",
  "paused",
  "archived",
]);

export const CheckpointReasonSchema = z.enum([
  "scheduled_interval",
  "rate_limit_imminent",
  "before_destructive_op",
  "sub_agent_handoff",
  "session_pause",
  "manual",
  "stage_transition",
]);

const _reasonCheck: z.infer<typeof CheckpointReasonSchema> extends CheckpointReason
  ? true
  : false = true;
void _reasonCheck;

export const BuildManifestStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
  "skipped",
]);

const _bmsCheck: z.infer<typeof BuildManifestStatusSchema> extends BuildManifestStatus
  ? true
  : false = true;
void _bmsCheck;

export const SubAgentSnapshotStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
]);

const _sasCheck: z.infer<typeof SubAgentSnapshotStatusSchema> extends SubAgentSnapshotStatus
  ? true
  : false = true;
void _sasCheck;

// ─── Build manifest task ──────────────────────────────────────────────

export const BuildManifestTaskSchema = z
  .object({
    id: z.string().min(1),
    specialist: z.string().min(1),
    status: BuildManifestStatusSchema,
    started_at: z.string().datetime({ offset: true }).optional(),
    completed_at: z.string().datetime({ offset: true }).optional(),
    error: z.string().optional(),
  })
  .strict();

const _bmtCheck: z.infer<typeof BuildManifestTaskSchema> extends BuildManifestTask
  ? true
  : false = true;
void _bmtCheck;

// ─── Sub-agent snapshot ───────────────────────────────────────────────

export const SubAgentSnapshotSchema = z
  .object({
    id: z.string().min(1),
    specialist: z.string().min(1),
    status: SubAgentSnapshotStatusSchema,
    sub_session_id: z.string().optional(),
    workspace_scope: z.string().min(1),
  })
  .strict();

const _sasShapeCheck: z.infer<typeof SubAgentSnapshotSchema> extends SubAgentSnapshot
  ? true
  : false = true;
void _sasShapeCheck;

// ─── Verification + eval-loop progress ────────────────────────────────

export const VerificationProgressSchema = z
  .object({
    checks_passed: z.array(z.string()),
    checks_failed: z.array(z.string()),
    iteration: z.number().int().min(1),
  })
  .strict();

const _vpCheck: z.infer<typeof VerificationProgressSchema> extends VerificationProgress
  ? true
  : false = true;
void _vpCheck;

export const EvalLoopProgressSchema = z
  .object({
    iteration: z.number().int().min(1),
    pass_rate: z.number().min(0).max(1),
    avg_score: z.number(),
  })
  .strict();

const _elpCheck: z.infer<typeof EvalLoopProgressSchema> extends EvalLoopProgress
  ? true
  : false = true;
void _elpCheck;

// ─── Checkpoint ───────────────────────────────────────────────────────

export const CheckpointSchema = z
  .object({
    id: z.string().regex(ULID, "must be ULID"),
    spec_version: z.string().regex(SEM_VER),
    pipeline_id: z.string().min(1),
    agent_id: z.string().min(1),
    session_id: z.string().min(1),
    parent_checkpoint_id: z.string().regex(ULID).optional(),

    dev_stage: AgentDevStageSchema,
    created_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),

    copilot_state: z.record(z.string(), z.unknown()),
    build_manifest: z.array(BuildManifestTaskSchema),

    conversation_summary: z.string(),
    conversation_tokens_estimate: z.number().int().min(0),
    active_skill_id: z.string().regex(KEBAB_CASE).optional(),
    active_tool_execution_id: z.string().optional(),

    files_written: z.array(z.string()),
    files_pending: z.array(z.string()),
    workspace_checksum: z.string().regex(SHA256, "must be sha256:<64-hex>"),

    sub_agents: z.array(SubAgentSnapshotSchema),

    verification_progress: VerificationProgressSchema.optional(),
    eval_loop_progress: EvalLoopProgressSchema.optional(),

    reason: CheckpointReasonSchema,
  })
  .strict();

const _checkpointCheck: z.infer<typeof CheckpointSchema> extends Checkpoint
  ? true
  : false = true;
void _checkpointCheck;
