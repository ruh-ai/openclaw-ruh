/**
 * Recovery actions.
 *
 * Implements: docs/spec/openclaw-v1/014-error-taxonomy.md#recovery-actions
 *
 * Maps error categories to concrete recovery actions. Each category has a
 * recovery function that prepares the next retry attempt — context_too_long
 * triggers compaction; malformed_response simplifies the prompt; etc.
 */

import type { ClassifiedError, ErrorCategory } from "./error-taxonomy";

// ─── Recovery action types ─────────────────────────────────────────────

export type RecoveryActionType =
  | "compact_context"
  | "simplify_prompt"
  | "extend_timeout"
  | "wait_and_retry"
  | "provide_error_context"
  | "none";

export interface RecoveryModifications {
  /** If set, reduce the prompt to this max token estimate. */
  readonly maxPromptTokens?: number;
  /** If set, multiply the current timeout by this factor. */
  readonly timeoutMultiplier?: number;
  /** If set, append this context to the next prompt. */
  readonly appendToPrompt?: string;
  /** If set, replace the system instruction with a simpler version. */
  readonly simplifyInstruction?: boolean;
}

export interface RecoveryAction {
  readonly type: RecoveryActionType;
  readonly description: string;
  readonly modifications: RecoveryModifications;
}

// ─── Recovery map ──────────────────────────────────────────────────────

type RecoveryFactory = (classified: ClassifiedError) => RecoveryAction;

const RECOVERY_MAP: Readonly<Record<ErrorCategory, RecoveryFactory>> = {
  context_too_long: () => ({
    type: "compact_context",
    description: "Compacting conversation history to fit within context window.",
    modifications: { maxPromptTokens: 80_000 },
  }),

  rate_limit: () => ({
    type: "wait_and_retry",
    description: "Rate limited. Waiting before retrying.",
    modifications: {},
  }),

  auth_error: () => ({
    type: "none",
    description: "Authentication failed. No automatic recovery.",
    modifications: {},
  }),

  gateway_timeout: () => ({
    type: "extend_timeout",
    description: "Gateway timed out. Retrying with a longer timeout.",
    modifications: { timeoutMultiplier: 1.5 },
  }),

  malformed_response: () => ({
    type: "simplify_prompt",
    description: "Response was malformed. Retrying with a simplified prompt.",
    modifications: { simplifyInstruction: true },
  }),

  tool_execution_failure: (classified) => ({
    type: "provide_error_context",
    description: "Tool failed. Providing error context to next attempt.",
    modifications: {
      appendToPrompt: `\n\n[PREVIOUS ERROR]\nThe previous attempt failed with: ${classified.originalMessage.slice(
        0,
        300,
      )}\nPlease try a different approach.\n[/PREVIOUS ERROR]`,
    },
  }),

  sandbox_unavailable: () => ({
    type: "wait_and_retry",
    description: "Sandbox is temporarily unavailable. Waiting before retrying.",
    modifications: {},
  }),

  model_refusal: () => ({
    type: "simplify_prompt",
    description: "Model refused to generate. Retrying with a simplified prompt.",
    modifications: { simplifyInstruction: true },
  }),

  network_error: () => ({
    type: "wait_and_retry",
    description: "Network error. Waiting before retrying.",
    modifications: {},
  }),

  manifest_invalid: () => ({
    type: "none",
    description: "Manifest validation failed. Surface to architect for regeneration.",
    modifications: {},
  }),

  permission_denied: () => ({
    type: "none",
    description: "Operation denied by permission policy. Agent must change approach.",
    modifications: {},
  }),

  eval_failure: () => ({
    type: "none",
    description:
      "Eval task scored below threshold. Handled by the convergence loop reflector.",
    modifications: {},
  }),

  unknown: (classified) => ({
    type: "provide_error_context",
    description: "Unexpected error. Providing error context to next attempt.",
    modifications: {
      appendToPrompt: `\n\n[PREVIOUS ERROR]\n${classified.originalMessage.slice(0, 300)}\n[/PREVIOUS ERROR]`,
    },
  }),
};

/** Get the appropriate recovery action for a classified error. */
export function getRecoveryAction(classified: ClassifiedError): RecoveryAction {
  const factory = RECOVERY_MAP[classified.category];
  return factory(classified);
}
