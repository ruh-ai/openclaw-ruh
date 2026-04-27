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

// ─── Error taxonomy + retry + recovery (Phase 1b) ──────────────────────
export * from "./error";

// ─── Output validator + marker parser + canonical schemas (Phase 1c) ──
export * from "./parser";

// ─── Decision log + redaction + in-memory store (Phase 1d) ─────────────
export * from "./decision-log";

// ─── Memory model: tier/lane authority + Memory facade (Phase 1e) ──────
export * from "./memory";

// ─── Config substrate: versioned multi-dimensional data (Phase 1f) ─────
export * from "./config";

// ─── Checkpoint + resume substrate (Phase 1g) ──────────────────────────
export * from "./checkpoint";

// ─── Lifecycle hooks: registry + runner + capabilities (Phase 1h) ──────
export * from "./hooks";

// ─── Lifecycle types ──────────────────────────────────────────────────
export type { AgentDevStage, PipelineDevStage, ExecutionMode, SubAgentStatus } from "./types";
