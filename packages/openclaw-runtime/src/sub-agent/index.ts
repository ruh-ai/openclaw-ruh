// Public surface of the sub-agent substrate (Phase 2b).

export type {
  SubAgentStatus,
  SubAgentConfig,
  SubAgent,
  SubAgentResult,
  SubAgentPartialCompletion,
  SubAgentCompletion,
  MergeAgentSummary,
  MergeResult,
  FileConflict,
} from "./types";

export {
  SUB_AGENT_STATUSES,
  TERMINAL_SUB_AGENT_STATUSES,
  isTerminalStatus,
} from "./types";

export {
  SubAgentStatusSchema,
  SubAgentConfigSchema,
  SubAgentResultSchema,
  SubAgentPartialCompletionSchema,
  SubAgentSchema,
  MergeResultSchema,
} from "./schemas";

export type { AgentUriParts } from "./agent-uri";
export {
  buildAgentUri,
  parseAgentUri,
  isAgentUri,
  AgentUriError,
} from "./agent-uri";

export type {
  ScopeViolationReason,
  ScopeCheckResult,
} from "./workspace-scope";
export {
  checkScope,
  assertInScope,
  lexicalNormalize,
  ScopeViolationError,
} from "./workspace-scope";

export {
  detectConflictPaths,
  detectFileConflicts,
  buildMergeResult,
} from "./merge";
