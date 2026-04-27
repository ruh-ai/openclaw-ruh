/**
 * Sub-agent isolation — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/sub-agent.schema.json.
 */

import { z } from "zod";
import { HandoffContextSchema } from "../orchestrator/schemas";
import type {
  MergeAgentSummary,
  MergeResult,
  SubAgent,
  SubAgentConfig,
  SubAgentPartialCompletion,
  SubAgentResult,
  SubAgentStatus,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const ULID = /^[0-9A-Z]{26}$/;
/** openclaw://<pipeline>/agents/<specialist>@<semver> */
const AGENT_URI = /^openclaw:\/\/[a-z][a-z0-9-]*\/agents\/[a-z][a-z0-9-]*@[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;

// ─── SubAgentStatus ───────────────────────────────────────────────────

export const SubAgentStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
  "skipped",
]);

const _statusCheck: z.infer<typeof SubAgentStatusSchema> extends SubAgentStatus
  ? true
  : false = true;
void _statusCheck;

// ─── SubAgentConfig ───────────────────────────────────────────────────

export const SubAgentConfigSchema = z
  .object({
    specialist: z.string().regex(KEBAB_CASE),
    parent_session_id: z.string().min(1),
    parent_decision_id: z.string().regex(ULID),
    workspace_scope: z.string().min(1),
    /** HandoffContext from orchestrator schema — strict per spec 006. */
    context: HandoffContextSchema,
  })
  .strict();

const _configCheck: z.infer<typeof SubAgentConfigSchema> extends SubAgentConfig
  ? true
  : false = true;
void _configCheck;

// ─── SubAgentPartialCompletion ────────────────────────────────────────

export const SubAgentPartialCompletionSchema = z
  .object({
    completed_steps: z.array(z.string()),
    pending_steps: z.array(z.string()),
  })
  .strict();

const _partialCheck: z.infer<typeof SubAgentPartialCompletionSchema> extends SubAgentPartialCompletion
  ? true
  : false = true;
void _partialCheck;

// ─── SubAgentResult ───────────────────────────────────────────────────

export const SubAgentResultSchema = z
  .object({
    success: z.boolean(),
    files_written: z.array(z.string()),
    output_summary: z.string().max(500),
    emitted_events: z.array(z.unknown()),
    decision_count: z.number().int().min(0),
    error: z.string().optional(),
    error_category: z.string().optional(),
    partial_completion: SubAgentPartialCompletionSchema.optional(),
  })
  .strict();

const _resultCheck: z.infer<typeof SubAgentResultSchema> extends SubAgentResult
  ? true
  : false = true;
void _resultCheck;

// ─── SubAgent ─────────────────────────────────────────────────────────

export const SubAgentSchema = z
  .object({
    id: z.string().regex(ULID),
    specialist: z.string().regex(KEBAB_CASE),
    agent_uri: z.string().regex(AGENT_URI, "must be openclaw://<pipeline>/agents/<specialist>@<semver>"),
    session_id: z.string().min(1),
    sandbox_id: z.string().min(1),
    workspace_scope: z.string().min(1),
    status: SubAgentStatusSchema,
    created_at: z.string().datetime({ offset: true }),
    completed_at: z.string().datetime({ offset: true }).optional(),
    result: SubAgentResultSchema.optional(),
    parent_session_id: z.string(),
    parent_decision_id: z.string().regex(ULID),
  })
  .strict();

const _subAgentCheck: z.infer<typeof SubAgentSchema> extends SubAgent
  ? true
  : false = true;
void _subAgentCheck;

// ─── MergeResult ──────────────────────────────────────────────────────

const MergeAgentSummarySchema = z
  .object({
    specialist: z.string().regex(KEBAB_CASE),
    success: z.boolean(),
    files_written: z.number().int().min(0),
    output_summary: z.string().max(500),
  })
  .strict();

const _summaryCheck: z.infer<typeof MergeAgentSummarySchema> extends MergeAgentSummary
  ? true
  : false = true;
void _summaryCheck;

/** Mirrors orchestrator's FileConflict; redeclared here so the merge schema is self-contained. */
const FileConflictSchema = z
  .object({
    path: z.string().min(1),
    agents: z.array(z.string().regex(KEBAB_CASE)).min(2),
    resolution: z.enum(["last-write-wins", "explicit-merge", "error"]),
  })
  .strict();

export const MergeResultSchema = z
  .object({
    success: z.boolean(),
    total_files: z.number().int().min(0),
    conflicts: z.array(FileConflictSchema),
    agent_results: z.array(MergeAgentSummarySchema),
    partial_completion: z.boolean(),
    failed_required: z.array(z.string().regex(KEBAB_CASE)).optional(),
    failed_optional: z.array(z.string().regex(KEBAB_CASE)).optional(),
  })
  .strict();

const _mergeCheck: z.infer<typeof MergeResultSchema> extends MergeResult
  ? true
  : false = true;
void _mergeCheck;
