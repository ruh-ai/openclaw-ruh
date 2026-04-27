/**
 * Eval task — Zod schemas.
 *
 * Mirrors docs/spec/openclaw-v1/schemas/eval-task.schema.json.
 */

import { z } from "zod";
import type {
  ConvergenceLoopConfig,
  EvalBudget,
  EvalIterationScore,
  EvalJudge,
  EvalJudgeKind,
  EvalLoopState,
  EvalLoopStatus,
  EvalRubric,
  EvalRubricDimension,
  EvalStatus,
  EvalStopReason,
  EvalSuite,
  EvalTask,
  EvalTaskExpected,
  EvalTaskInput,
  EvalTaskSource,
  ReflectorOutput,
  SkillMutation,
  SkillRewrite,
  SkillRewriteKind,
} from "./types";

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const SEM_VER = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/;

// ─── Status / stop-reason / source ────────────────────────────────────

export const EvalStatusSchema = z.enum([
  "pending",
  "running",
  "pass",
  "fail",
  "manual",
  "error",
]);

const _statusCheck: z.infer<typeof EvalStatusSchema> extends EvalStatus
  ? true
  : false = true;
void _statusCheck;

export const EvalStopReasonSchema = z.enum([
  "all_passed",
  "max_iterations",
  "degraded",
  "no_actionable_changes",
  "mutation_failed",
  "budget_exhausted",
  "aborted",
]);

const _stopCheck: z.infer<typeof EvalStopReasonSchema> extends EvalStopReason
  ? true
  : false = true;
void _stopCheck;

export const EvalLoopStatusSchema = z.enum([
  "running",
  "completed",
  "degraded",
  "aborted",
]);

const _loopStatusCheck: z.infer<typeof EvalLoopStatusSchema> extends EvalLoopStatus
  ? true
  : false = true;
void _loopStatusCheck;

export const EvalTaskSourceSchema = z.union([
  z
    .object({
      kind: z.literal("synthetic"),
      author: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("historical"),
      pipeline_id: z.string(),
      original_session_id: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("customer-curated"),
      customer: z.string(),
      reference: z.string(),
    })
    .strict(),
]);

const _sourceCheck: z.infer<typeof EvalTaskSourceSchema> extends EvalTaskSource
  ? true
  : false = true;
void _sourceCheck;

// ─── Input + expected ────────────────────────────────────────────────

const EvalTaskInputFileSchema = z
  .object({
    path: z.string().min(1),
    content_ref: z.string().min(1),
  })
  .strict();

export const EvalTaskInputSchema = z
  .object({
    user_message: z.string().optional(),
    files: z.array(EvalTaskInputFileSchema).optional(),
    initial_state: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (i) =>
      i.user_message !== undefined ||
      (i.files && i.files.length > 0) ||
      i.initial_state !== undefined,
    { message: "EvalTaskInput must declare at least one of user_message / files / initial_state" },
  );

const _inputCheck: z.infer<typeof EvalTaskInputSchema> extends EvalTaskInput
  ? true
  : false = true;
void _inputCheck;

const EvalExpectedFileSchema = z
  .object({
    path: z.string().min(1),
    content_ref: z.string().optional(),
    structural_match: z.record(z.string(), z.unknown()).optional(),
    semantic_match: z.string().optional(),
  })
  .strict();

const EvalExpectedDecisionSchema = z
  .object({
    type: z.string(),
    metadata_constraints: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const EvalTaskExpectedSchema = z
  .object({
    output_summary: z.string().min(1).optional(),
    files_written: z.array(EvalExpectedFileSchema).optional(),
    decisions: z.array(EvalExpectedDecisionSchema).optional(),
    must_call_tools: z.array(z.string().regex(KEBAB_CASE)).optional(),
    must_not_call_tools: z.array(z.string().regex(KEBAB_CASE)).optional(),
  })
  .strict()
  .refine(
    (e) =>
      (e.files_written && e.files_written.length > 0) ||
      (e.output_summary !== undefined && e.output_summary.length > 0) ||
      (e.must_call_tools && e.must_call_tools.length > 0) ||
      (e.must_not_call_tools && e.must_not_call_tools.length > 0),
    {
      message:
        "EvalTaskExpected must declare at least one measurable expectation (files_written / output_summary / must_call_tools / must_not_call_tools)",
    },
  );

const _expectedCheck: z.infer<typeof EvalTaskExpectedSchema> extends EvalTaskExpected
  ? true
  : false = true;
void _expectedCheck;

// ─── Judge + rubric ──────────────────────────────────────────────────

const EvalRubricDimensionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    scale: z
      .object({ min: z.number(), max: z.number() })
      .strict(),
    tolerance_percent: z.number().min(0).max(100).optional(),
  })
  .strict();

const _dimCheck: z.infer<typeof EvalRubricDimensionSchema> extends EvalRubricDimension
  ? true
  : false = true;
void _dimCheck;

export const EvalRubricSchema = z
  .object({
    dimensions: z.array(EvalRubricDimensionSchema).min(1),
    pass_threshold: z.number(),
  })
  .strict();

const _rubricCheck: z.infer<typeof EvalRubricSchema> extends EvalRubric
  ? true
  : false = true;
void _rubricCheck;

const EvalJudgeKindSchema = z.enum(["exact", "structural", "semantic", "composite"]);

const _kindCheck: z.infer<typeof EvalJudgeKindSchema> extends EvalJudgeKind
  ? true
  : false = true;
void _kindCheck;

export const EvalJudgeSchema: z.ZodType<EvalJudge> = z.lazy(() =>
  z
    .object({
      kind: EvalJudgeKindSchema,
      prompt: z.string().optional(),
      rubric: EvalRubricSchema.optional(),
      weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
      sub_judges: z.array(EvalJudgeSchema).optional(),
    })
    .strict(),
);

// ─── EvalTask + EvalSuite ────────────────────────────────────────────

export const EvalTaskSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    spec_version: z.string().regex(SEM_VER),
    name: z.string().min(1),
    description: z.string().min(1),
    source: EvalTaskSourceSchema,
    input: EvalTaskInputSchema,
    expected: EvalTaskExpectedSchema,
    judge: EvalJudgeSchema,
    acceptance_threshold: z.number().min(0).max(1),
    status: EvalStatusSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    iteration: z.number().int().min(1).optional(),
    deltas: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict();

const _taskCheck: z.infer<typeof EvalTaskSchema> extends EvalTask
  ? true
  : false = true;
void _taskCheck;

export const EvalSuiteSchema = z
  .object({
    spec_version: z.string().regex(SEM_VER),
    pipeline_id: z.string().regex(KEBAB_CASE),
    name: z.string().min(1),
    description: z.string().min(1),
    tasks: z.array(EvalTaskSchema).min(1),
    judge_model: z.string().min(1),
    pass_rate_threshold: z.number().min(0).max(1),
  })
  .strict();

const _suiteCheck: z.infer<typeof EvalSuiteSchema> extends EvalSuite
  ? true
  : false = true;
void _suiteCheck;

// ─── Convergence loop ─────────────────────────────────────────────────

export const EvalBudgetSchema = z
  .object({
    max_llm_calls: z.number().int().min(1),
    max_cost_usd: z.number().min(0),
  })
  .strict();

const _budgetCheck: z.infer<typeof EvalBudgetSchema> extends EvalBudget
  ? true
  : false = true;
void _budgetCheck;

export const ConvergenceLoopConfigSchema = z
  .object({
    max_iterations: z.number().int().min(1).max(50),
    max_consecutive_degradations: z.number().int().min(1),
    reload_pause_ms: z.number().int().min(0),
    pass_rate_threshold: z.number().min(0).max(1),
    budget: EvalBudgetSchema,
  })
  .strict();

const _convergenceCheck: z.infer<typeof ConvergenceLoopConfigSchema> extends ConvergenceLoopConfig
  ? true
  : false = true;
void _convergenceCheck;

const EvalIterationScoreSchema = z
  .object({
    iteration: z.number().int(),
    pass_rate: z.number().min(0).max(1),
    avg_score: z.number(),
  })
  .strict();

const _scoreCheck: z.infer<typeof EvalIterationScoreSchema> extends EvalIterationScore
  ? true
  : false = true;
void _scoreCheck;

const SkillRewriteKindSchema = z.enum([
  "section_replace",
  "section_append",
  "frontmatter_update",
]);

const _rewriteKindCheck: z.infer<typeof SkillRewriteKindSchema> extends SkillRewriteKind
  ? true
  : false = true;
void _rewriteKindCheck;

export const SkillMutationSchema = z
  .object({
    skill_id: z.string().regex(KEBAB_CASE),
    iteration: z.number().int().min(1),
    rewrite_kind: SkillRewriteKindSchema,
    target_section: z.string().optional(),
    new_content: z.string(),
    accepted: z.boolean().optional(),
    reverted_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const _mutationCheck: z.infer<typeof SkillMutationSchema> extends SkillMutation
  ? true
  : false = true;
void _mutationCheck;

export const SkillRewriteSchema = z
  .object({
    skill_id: z.string().regex(KEBAB_CASE),
    rewrite_kind: SkillRewriteKindSchema,
    target_section: z.string().optional(),
    new_content: z.string(),
  })
  .strict();

const _rewriteCheck: z.infer<typeof SkillRewriteSchema> extends SkillRewrite
  ? true
  : false = true;
void _rewriteCheck;

export const ReflectorOutputSchema = z
  .object({
    rewrites: z.array(SkillRewriteSchema),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const _reflCheck: z.infer<typeof ReflectorOutputSchema> extends ReflectorOutput
  ? true
  : false = true;
void _reflCheck;

const EvalCostEstimateSchema = z
  .object({
    agent_calls: z.number().int().min(0),
    judge_calls: z.number().int().min(0),
    reflector_calls: z.number().int().min(0),
    total_llm_calls: z.number().int().min(0),
    estimated_cost_usd: z.number().min(0),
  })
  .strict();

export const EvalLoopStateSchema = z
  .object({
    iteration: z.number().int().min(0),
    max_iterations: z.number().int().min(1),
    scores: z.array(EvalIterationScoreSchema),
    mutations: z.array(SkillMutationSchema),
    cost: EvalCostEstimateSchema.optional(),
    status: EvalLoopStatusSchema,
    stop_reason: EvalStopReasonSchema.optional(),
  })
  .strict();

const _loopStateCheck: z.infer<typeof EvalLoopStateSchema> extends EvalLoopState
  ? true
  : false = true;
void _loopStateCheck;
