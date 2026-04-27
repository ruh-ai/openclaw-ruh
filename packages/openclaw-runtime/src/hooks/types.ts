/**
 * Hooks substrate — types.
 *
 * Implements: docs/spec/openclaw-v1/013-hooks.md
 *
 * Hooks are named extension points the runtime fires at well-defined
 * moments. Pipelines attach handlers for telemetry, alerting, review
 * routing, and external-system integration without forking the runtime.
 *
 * Substrate scope:
 *   - Hook name registry (closed v1 set + custom: namespace)
 *   - Capability shape declarations (no implementations — runtime supplies)
 *   - Handler + context types
 *   - VETO sentinel for the small veto-able hook set
 *   - Registry + runner (separate files)
 *
 * Out of scope (runtime layer):
 *   - Loading handler modules from .openclaw/hooks/ (filesystem)
 *   - Implementing egress_http, send_email, send_teams_card, etc.
 *   - Per-pipeline strict/loose mode wiring (the substrate accepts it as input)
 */

import type { DecisionLog } from "../decision-log/log";

// ─── Canonical hook names (closed set per spec §the-hook-points) ──────

export type CanonicalHookName =
  // Session lifecycle
  | "session_start"
  | "session_end"
  // Stage transitions
  | "stage_transition"
  // Tool execution
  | "pre_tool_execution"
  | "post_tool_execution"
  | "tool_approval_required"
  // Memory + config
  | "memory_write_review_required"
  | "memory_write_confirmed"
  | "memory_write_rejected"
  | "config_review_required"
  | "config_commit"
  | "compaction_ran"
  // Sub-agents + orchestration
  | "sub_agent_spawn"
  | "sub_agent_complete"
  | "result_merge"
  // Verification + eval
  | "verification_check"
  | "verification_iteration_complete"
  | "eval_task_complete"
  | "eval_iteration_complete"
  // Errors + recovery
  | "error_classified"
  | "retry_decided"
  | "recovery_applied"
  // Output validation
  | "output_validation_passed"
  | "output_validation_failed"
  // Checkpoint
  | "checkpoint_created"
  | "checkpoint_resumed"
  | "checkpoint_drift_detected";

export const CANONICAL_HOOK_NAMES: ReadonlyArray<CanonicalHookName> = [
  "session_start",
  "session_end",
  "stage_transition",
  "pre_tool_execution",
  "post_tool_execution",
  "tool_approval_required",
  "memory_write_review_required",
  "memory_write_confirmed",
  "memory_write_rejected",
  "config_review_required",
  "config_commit",
  "compaction_ran",
  "sub_agent_spawn",
  "sub_agent_complete",
  "result_merge",
  "verification_check",
  "verification_iteration_complete",
  "eval_task_complete",
  "eval_iteration_complete",
  "error_classified",
  "retry_decided",
  "recovery_applied",
  "output_validation_passed",
  "output_validation_failed",
  "checkpoint_created",
  "checkpoint_resumed",
  "checkpoint_drift_detected",
];

/**
 * Custom hook name. Format: `custom:<namespace>:<event>`. Pipelines fire
 * their own events under their namespace; the runtime validates the
 * payload against a manifest-declared schema before firing.
 */
export type CustomHookName = `custom:${string}:${string}`;

export type HookName = CanonicalHookName | CustomHookName;

/**
 * Canonical pattern for custom hook names per
 * `docs/spec/openclaw-v1/schemas/hooks.schema.json`:
 *
 *   ^custom:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$
 *
 * Exactly three colon-separated segments — `custom:<kebab-namespace>:
 * <kebab-event>`. Namespace and event must be lowercase kebab-case
 * starting with a letter. Earlier substrate revisions allowed extra
 * segments (`custom:ecc:rfq:shipped`) and tolerated uppercase /
 * underscores (`custom:ECC:Bad_Event`); both diverged from the spec
 * and let typo'd manifests pass validation.
 */
export const CUSTOM_HOOK_NAME_PATTERN =
  /^custom:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/** True iff the input is a valid custom hook name (`custom:<ns>:<event>`). */
export function isCustomHookName(name: string): name is CustomHookName {
  return CUSTOM_HOOK_NAME_PATTERN.test(name);
}

/** True iff name is in the canonical set. */
export function isCanonicalHookName(name: string): name is CanonicalHookName {
  return (CANONICAL_HOOK_NAMES as ReadonlyArray<string>).includes(name);
}

// ─── Veto-able hooks (closed set per spec §veto-handlers) ─────────────

export type VetoableHookName =
  | "pre_tool_execution"
  | "tool_approval_required"
  | "memory_write_review_required";

export const VETOABLE_HOOK_NAMES: ReadonlyArray<VetoableHookName> = [
  "pre_tool_execution",
  "tool_approval_required",
  "memory_write_review_required",
];

export function isVetoableHook(name: string): name is VetoableHookName {
  return (VETOABLE_HOOK_NAMES as ReadonlyArray<string>).includes(name);
}

// ─── Capability model ─────────────────────────────────────────────────

export type HookCapability =
  | { readonly kind: "decision_log_emit" }
  | { readonly kind: "egress_http"; readonly allowed_hosts: ReadonlyArray<string> }
  | {
      readonly kind: "send_email";
      readonly from: string;
      /** Glob/regex/literal — interpretation is runtime-supplied. */
      readonly to_pattern: string;
    }
  | { readonly kind: "send_teams_card"; readonly channel: string }
  | { readonly kind: "publish_metric"; readonly namespace: string }
  | {
      readonly kind: "external_approval_gate";
      readonly request_id_prefix: string;
    }
  | {
      readonly kind: "read_decision_log";
      readonly scope: "session" | "pipeline";
    };

export type HookCapabilityKind = HookCapability["kind"];

export const HOOK_CAPABILITY_KINDS: ReadonlyArray<HookCapabilityKind> = [
  "decision_log_emit",
  "egress_http",
  "send_email",
  "send_teams_card",
  "publish_metric",
  "external_approval_gate",
  "read_decision_log",
];

// ─── VETO sentinel (only honoured for veto-able hooks) ────────────────

const VETO_BRAND = Symbol.for("@ruh/openclaw-runtime/hook-veto");

export interface VetoResult {
  readonly [VETO_BRAND]: true;
  readonly reason: string;
}

/** Construct a veto result. Handlers return this from veto-able hooks. */
export function VETO(input: { reason: string }): VetoResult {
  return { [VETO_BRAND]: true, reason: input.reason };
}

export function isVetoResult(value: unknown): value is VetoResult {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<symbol, unknown>)[VETO_BRAND] === true
  );
}

// ─── Handler signature + context ──────────────────────────────────────

export type HookFireMode = "sync" | "fire_and_forget";

/**
 * What a handler returns. `void` is observation-only. A `VetoResult` is
 * honoured by veto-able hooks; ignored elsewhere with a warning.
 */
export type HookHandlerReturn = void | VetoResult;

export type HookHandler<TPayload = unknown> = (
  payload: TPayload,
  ctx: HookContext,
) => HookHandlerReturn | Promise<HookHandlerReturn>;

export interface HookContext {
  readonly pipeline_id: string;
  readonly agent_id?: string;
  readonly session_id?: string;
  readonly fire_mode: HookFireMode;
  /** The handler's resolved capability set — only those declared on registration. */
  readonly capabilities: ReadonlyArray<HookCapability>;
  /** Optional decision-log handle. Present iff `decision_log_emit` is in capabilities. */
  readonly decisionLog?: DecisionLog;
}

// ─── Registration scope + record ──────────────────────────────────────

export type HookScope = "runtime" | "pipeline" | "session";

export interface RegisteredHook<TPayload = unknown> {
  readonly id: string;
  readonly name: HookName;
  readonly handler: HookHandler<TPayload>;
  readonly fire_mode: HookFireMode;
  readonly scope: HookScope;
  readonly capabilities: ReadonlyArray<HookCapability>;
  /** Free-form label for log diagnostics (e.g. handler module path). */
  readonly label?: string;
}

// ─── Fire result aggregate ────────────────────────────────────────────

export interface HookHandlerFailure {
  readonly handler_id: string;
  readonly label?: string;
  readonly error: string;
}

export interface HookFireResult {
  readonly hook_name: HookName;
  readonly handler_count: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failures: ReadonlyArray<HookHandlerFailure>;
  /** When set, a veto-able hook was vetoed by the named handler. */
  readonly veto?: { readonly handler_id: string; readonly reason: string };
  /** When set, fire-and-forget handlers were dispatched but not awaited. */
  readonly dispatched_async: number;
}
