/**
 * @ruh/openclaw-runtime
 *
 * Runtime substrate for OpenClaw pipelines.
 *
 * Spec target: docs/spec/openclaw-v1/ at version `1.0.0-rc.1`.
 */

export { SPEC_VERSION } from "./spec-version";

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

// ─── Orchestrator protocol: routing + merge policy + handoff shapes (Phase 2a) ──
export * from "./orchestrator";

// ─── Sub-agent isolation: scope, agent URI, merge builder (Phase 2b) ──
export * from "./sub-agent";

// ─── Eval task + convergence loop substrate (Phase 2c) ────────────────
export * from "./eval";

// ─── Pipeline manifest: top-level artifact + cross-validation (Phase 2d) ──
export * from "./pipeline-manifest";

// ─── Lifecycle types ──────────────────────────────────────────────────
export type { AgentDevStage, PipelineDevStage, ExecutionMode, SubAgentStatus } from "./types";
