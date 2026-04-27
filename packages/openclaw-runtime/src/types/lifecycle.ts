/**
 * Lifecycle types shared across the runtime.
 * Aligned to OpenClaw Spec v1.0.0-rc.1 sections 002 and 011.
 */

/**
 * Agent-level dev stage. 7 values per 002 lifecycle states.
 * See: docs/spec/openclaw-v1/002-agent-manifest.md#lifecycle-states
 */
export type AgentDevStage =
  | "drafted"
  | "validated"
  | "tested"
  | "shipped"
  | "running"
  | "paused"
  | "archived";

/**
 * Pipeline-level dev stage. Strict 4-value subset of AgentDevStage.
 * See: docs/spec/openclaw-v1/011-pipeline-manifest.md#lifecycle
 */
export type PipelineDevStage = "drafted" | "validated" | "tested" | "shipped";

/**
 * Execution mode. Drives permission policy in the tool pipeline.
 * See: docs/spec/openclaw-v1/003-tool-contract.md
 */
export type ExecutionMode =
  | "agent"
  | "copilot"
  | "build"
  | "test"
  | "ship";

/**
 * Sub-agent status. Aligned to docs/spec/openclaw-v1/007-sub-agent.md.
 * 'stopped' = killed mid-run; 'skipped' = orchestrator chose not to run.
 */
export type SubAgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "skipped";
