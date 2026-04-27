// Public surface of the orchestrator substrate (Phase 2a).

export type {
  OrchestratorRef,
  RoutingRules,
  RoutingRule,
  MatchClause,
  MatchAgentStatus,
  MatchComparison,
  FanOutSpec,
  FailurePolicy,
  MergeResolution,
  MergePolicyRule,
  HandoffContext,
  OrchestratorHandoff,
  OrchestratorResult,
  FileConflict,
  MergedResponse,
} from "./types";

export {
  FAILURE_POLICIES,
  DEFAULT_FAILURE_POLICY,
} from "./types";

export {
  OrchestratorRefSchema,
  MatchClauseSchema,
  FanOutSpecSchema,
  RoutingRuleSchema,
  RoutingRulesSchema,
  FailurePolicySchema,
  MergePolicyRuleSchema,
  HandoffContextSchema,
  OrchestratorHandoffSchema,
  OrchestratorResultSchema,
} from "./schemas";

export type {
  MatchContext,
  CustomMatcher,
  RoutingOutcome,
  FindRoutingMatchInput,
} from "./routing";
export {
  findRoutingMatch,
  resolveFanOutParallelism,
  FAN_OUT_BASELINE,
  RoutingCustomMatcherUnavailableError,
} from "./routing";

export {
  resolveMergePolicy,
  matchGlob,
  compileGlob,
} from "./merge-policy";
