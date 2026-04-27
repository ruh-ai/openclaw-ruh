/**
 * Per-hook default capability sets — applied in loose mode.
 *
 * Per spec §per-hook-default-capability-sets, the runtime auto-applies
 * these when the manifest omits explicit capabilities. Strict pipelines
 * disable defaults and require explicit declarations on every hook.
 *
 * Loose mode is convenient for early dev; strict is recommended for
 * production. The pipeline manifest's `hook_capability_mode` toggles
 * between them.
 *
 * NOTE: per the spec table only the `kind` is fixed at the default level
 * — runtime implementations supply the parameter values (allowed hosts,
 *   email senders, Teams channels) via configuration. The substrate
 *   declares the kind list; the runtime composes the full capability.
 */

import type { CanonicalHookName, HookCapabilityKind } from "./types";

/**
 * Map from canonical hook name → default capability kinds.
 * Hooks not in this map default to `decision_log_emit` only (per spec
 * "*" row).
 */
export const DEFAULT_CAPABILITY_KINDS: Readonly<
  Partial<Record<CanonicalHookName, ReadonlyArray<HookCapabilityKind>>>
> = {
  // Errors and recovery
  error_classified: ["decision_log_emit", "publish_metric"],
  retry_decided: ["decision_log_emit", "publish_metric"],
  recovery_applied: ["decision_log_emit", "publish_metric"],

  // Approval / review
  tool_approval_required: [
    "send_email",
    "send_teams_card",
    "external_approval_gate",
  ],
  memory_write_review_required: [
    "send_email",
    "send_teams_card",
    "external_approval_gate",
  ],

  // Telemetry export
  eval_iteration_complete: ["egress_http", "publish_metric"],

  // Output validation
  output_validation_failed: ["decision_log_emit", "publish_metric"],
};

const FALLBACK: ReadonlyArray<HookCapabilityKind> = ["decision_log_emit"];

/** Returns the default capability-kind list for a hook (loose mode). */
export function defaultCapabilityKindsFor(
  name: CanonicalHookName,
): ReadonlyArray<HookCapabilityKind> {
  return DEFAULT_CAPABILITY_KINDS[name] ?? FALLBACK;
}
