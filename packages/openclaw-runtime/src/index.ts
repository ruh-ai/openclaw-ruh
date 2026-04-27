/**
 * @ruh/openclaw-runtime
 *
 * Runtime substrate for OpenClaw pipelines.
 *
 * Spec target: docs/spec/openclaw-v1/ at version `1.0.0-rc.1`.
 */

export const SPEC_VERSION = "1.0.0-rc.1" as const;

// ─── Tool harness (Phase 1a) ───────────────────────────────────────────
export * from "./tools";

// ─── Lifecycle types ──────────────────────────────────────────────────
export type { AgentDevStage, PipelineDevStage, ExecutionMode, SubAgentStatus } from "./types";

// ─── Phase 1b-1h modules — added in subsequent commits ─────────────────
// export * from "./error";
// export * from "./parser";
// export * from "./decision-log";
// export * from "./memory";
// export * from "./config";
// export * from "./checkpoint";
// export * from "./hooks";
