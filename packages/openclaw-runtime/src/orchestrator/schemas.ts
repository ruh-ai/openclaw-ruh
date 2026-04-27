/**
 * Orchestrator protocol — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/orchestrator.schema.json. JSON
 * Schema is the canonical contract; these Zod schemas are the in-process
 * equivalents the substrate uses for runtime validation.
 */

import { z } from "zod";
import type {
  FailurePolicy,
  FanOutSpec,
  HandoffContext,
  MatchClause,
  MergePolicyRule,
  OrchestratorHandoff,
  OrchestratorRef,
  OrchestratorResult,
  RoutingRule,
  RoutingRules,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const ULID = /^[0-9A-Z]{26}$/;

// ─── OrchestratorRef ──────────────────────────────────────────────────

export const OrchestratorRefSchema = z
  .object({
    agent_id: z.string().regex(KEBAB_CASE),
    skills: z.array(z.string().regex(KEBAB_CASE)).min(1),
  })
  .strict();

const _refCheck: z.infer<typeof OrchestratorRefSchema> extends OrchestratorRef
  ? true
  : false = true;
void _refCheck;

// ─── MatchClause ──────────────────────────────────────────────────────

const MatchAgentStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "stopped",
  "skipped",
]);

const MatchComparisonSchema = z.enum(["<", "<=", "==", "!=", ">=", ">"]);

/**
 * MatchClause — `additionalProperties: true` per spec so pipelines may
 * pass through fields a custom matcher consumes. The substrate validates
 * the well-known fields and lets the custom matcher own the rest.
 *
 * `.passthrough()` is load-bearing here: a plain `z.object(...)` strips
 * unknown keys at parse time, which means after a manifest is parsed a
 * custom matcher would see an empty bag instead of e.g. `tenant_tier`.
 * This was a real bug in the round-1 implementation.
 */
export const MatchClauseSchema = z
  .object({
    stage: z.string().optional(),
    message_kind: z.string().optional(),
    input_has: z.array(z.string()).optional(),
    regions: z.array(z.string().regex(KEBAB_CASE)).optional(),
    agent_status: z.record(z.string(), MatchAgentStatusSchema).optional(),
    decision_count: z
      .record(MatchComparisonSchema, z.number().int())
      .optional(),
    custom: z.string().optional(),
  })
  .passthrough();

const _matchCheck: z.infer<typeof MatchClauseSchema> extends MatchClause
  ? true
  : false = true;
void _matchCheck;

// ─── FanOutSpec ────────────────────────────────────────────────────────

export const FanOutSpecSchema = z
  .object({
    specialist: z.string().regex(KEBAB_CASE),
    split_input: z.string().min(1),
    max_parallelism: z.number().int().min(1).max(32).optional(),
  })
  .strict();

const _fanCheck: z.infer<typeof FanOutSpecSchema> extends FanOutSpec
  ? true
  : false = true;
void _fanCheck;

// ─── RoutingRule ──────────────────────────────────────────────────────

/**
 * RoutingRule — must declare exactly one of specialist / specialists /
 * fan_out. The schema's `anyOf` couldn't be expressed cleanly in Zod, so
 * we enforce the constraint via a `.refine` on the parsed object.
 */
export const RoutingRuleSchema = z
  .object({
    match: MatchClauseSchema,
    specialist: z.string().regex(KEBAB_CASE).optional(),
    specialists: z.array(z.string().regex(KEBAB_CASE)).optional(),
    fan_out: FanOutSpecSchema.optional(),
    then: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    priority: z.number().int().optional(),
  })
  .strict()
  .refine(
    (r) => {
      const declared = [r.specialist, r.specialists, r.fan_out].filter(
        (v) => v !== undefined,
      ).length;
      return declared === 1;
    },
    {
      message:
        "exactly one of `specialist`, `specialists`, or `fan_out` must be set",
    },
  );

const _ruleCheck: z.infer<typeof RoutingRuleSchema> extends RoutingRule
  ? true
  : false = true;
void _ruleCheck;

// ─── RoutingRules ─────────────────────────────────────────────────────

export const RoutingRulesSchema = z
  .object({
    rules: z.array(RoutingRuleSchema),
    fallback: z.string().min(1),
    fan_out_default_max_parallelism: z.number().int().min(1).max(32).optional(),
  })
  .strict();

const _rulesCheck: z.infer<typeof RoutingRulesSchema> extends RoutingRules
  ? true
  : false = true;
void _rulesCheck;

// ─── FailurePolicy + MergePolicyRule ──────────────────────────────────

export const FailurePolicySchema = z.enum([
  "abort",
  "skip",
  "retry-then-escalate",
  "retry-then-skip",
  "manual-review",
]);

const _failCheck: z.infer<typeof FailurePolicySchema> extends FailurePolicy
  ? true
  : false = true;
void _failCheck;

export const MergePolicyRuleSchema = z
  .object({
    path_glob: z.string().min(1),
    resolution: z.enum(["last-write-wins", "explicit-merge", "error"]),
  })
  .strict();

const _mergeCheck: z.infer<typeof MergePolicyRuleSchema> extends MergePolicyRule
  ? true
  : false = true;
void _mergeCheck;

// ─── Handoff / result shapes ──────────────────────────────────────────

export const HandoffContextSchema = z
  .object({
    user_message: z.string().optional(),
    upstream_results: z.record(z.string(), z.unknown()).optional(),
    config_filter: z.record(z.string(), z.unknown()).optional(),
    memory_lanes: z.array(z.string().regex(KEBAB_CASE)).optional(),
    /**
     * Workspace-relative path. Absolute paths and scheme prefixes
     * (file://, http://, etc.) are rejected at parse time — they would
     * lexically normalize to the root and broaden access to the entire
     * workspace.
     */
    workspace_scope: z
      .string()
      .min(1)
      .refine((s) => !/^\//.test(s), {
        message: "workspace_scope must not be absolute (no leading /)",
      })
      .refine((s) => !/^[a-zA-Z]:[\\/]/.test(s) && !s.startsWith("\\\\"), {
        message: "workspace_scope must not be a Windows absolute path",
      })
      .refine((s) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?/.test(s), {
        message: "workspace_scope must not carry a scheme prefix (file://, http://, ...)",
      }),
    deadline: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const _handoffCtxCheck: z.infer<typeof HandoffContextSchema> extends HandoffContext
  ? true
  : false = true;
void _handoffCtxCheck;

export const OrchestratorHandoffSchema = z
  .object({
    to_specialist: z.string().regex(KEBAB_CASE),
    context: HandoffContextSchema,
    parent_session_id: z.string().min(1),
    parent_decision_id: z.string().regex(ULID),
  })
  .strict();

const _handoffCheck: z.infer<typeof OrchestratorHandoffSchema> extends OrchestratorHandoff
  ? true
  : false = true;
void _handoffCheck;

export const OrchestratorResultSchema = z
  .object({
    specialist: z.string().regex(KEBAB_CASE),
    success: z.boolean(),
    files_written: z.array(z.string()),
    decision_log_entries: z.number().int().min(0),
    output_summary: z.string().max(200),
    emitted_events: z.array(z.unknown()).optional(),
    error: z.string().optional(),
  })
  .strict();

const _resultCheck: z.infer<typeof OrchestratorResultSchema> extends OrchestratorResult
  ? true
  : false = true;
void _resultCheck;
