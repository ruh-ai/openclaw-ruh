// Public surface of the eval substrate (Phase 2c).

export type {
  EvalStatus,
  EvalTaskSource,
  EvalTaskInput,
  EvalTaskInputFile,
  EvalTaskExpected,
  EvalExpectedFile,
  EvalExpectedDecision,
  EvalRubric,
  EvalRubricDimension,
  EvalJudge,
  EvalJudgeKind,
  EvalDelta,
  EvalTask,
  EvalSuite,
  EvalBudget,
  ConvergenceLoopConfig,
  EvalIterationScore,
  EvalCostEstimate,
  EvalLoopStatus,
  EvalStopReason,
  EvalLoopState,
  SkillRewriteKind,
  SkillRewrite,
  SkillMutation,
  ReflectorOutput,
} from "./types";

export { EVAL_STATUSES, EVAL_STOP_REASONS } from "./types";

export {
  EvalStatusSchema,
  EvalStopReasonSchema,
  EvalLoopStatusSchema,
  EvalTaskSourceSchema,
  EvalTaskInputSchema,
  EvalTaskExpectedSchema,
  EvalRubricSchema,
  EvalJudgeSchema,
  EvalTaskSchema,
  EvalSuiteSchema,
  EvalBudgetSchema,
  ConvergenceLoopConfigSchema,
  SkillMutationSchema,
  SkillRewriteSchema,
  ReflectorOutputSchema,
  EvalLoopStateSchema,
} from "./schemas";

export type {
  JudgeOutcome,
  DimensionScore,
  RubricScoreInput,
  CompositeOutcomeInput,
} from "./scoring";
export {
  scoreExact,
  scoreStructural,
  scoreRubric,
  scoreComposite,
  withinTolerance,
} from "./scoring";

export type { ContinueVerdict, ContinueInput, EstimateCostInput } from "./convergence";
export {
  decideContinue,
  consecutiveDegradations,
  estimateCost,
  withinBudget,
} from "./convergence";
