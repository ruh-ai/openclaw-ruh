/**
 * Error taxonomy.
 *
 * Implements: docs/spec/openclaw-v1/014-error-taxonomy.md
 *
 * 13 error categories. Every error in OpenClaw classifies into exactly one of
 * these. There is no "untyped error" — anything escaping typed handling is a
 * defect to fix in the next spec patch.
 */

// ─── Error categories ──────────────────────────────────────────────────

export type ErrorCategory =
  | "context_too_long"
  | "rate_limit"
  | "auth_error"
  | "gateway_timeout"
  | "malformed_response"
  | "tool_execution_failure"
  | "sandbox_unavailable"
  | "model_refusal"
  | "network_error"
  | "manifest_invalid"
  | "permission_denied"
  | "eval_failure"
  | "unknown";

/**
 * Every category in one list — useful for runtime iteration and validation.
 */
export const ERROR_CATEGORIES: ReadonlyArray<ErrorCategory> = [
  "context_too_long",
  "rate_limit",
  "auth_error",
  "gateway_timeout",
  "malformed_response",
  "tool_execution_failure",
  "sandbox_unavailable",
  "model_refusal",
  "network_error",
  "manifest_invalid",
  "permission_denied",
  "eval_failure",
  "unknown",
];

// ─── Classified error ──────────────────────────────────────────────────

export interface ClassifiedError {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  /** Raw error message, kept for debugging. May contain credentials/internal paths — never surface to end users. */
  readonly originalMessage: string;
  /** Sanitized, human-readable message safe for the dashboard and the agent's self-correction context. */
  readonly userMessage: string;
  /** Populated when classification was via classifyToolError. */
  readonly toolName?: string;
}

// ─── Pattern matching ──────────────────────────────────────────────────

interface PatternRule {
  readonly patterns: ReadonlyArray<string>;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  /**
   * Returns the sanitized user-facing message for this category. Crucially
   * this signature accepts NO arguments — the rule cannot interpolate the
   * raw error message into userMessage. Raw details belong in
   * originalMessage and flow through the decision log's write-time
   * redaction; userMessage is forwarded to AG-UI and must never carry
   * unredacted operator data. Adding `(original: string)` here would
   * re-open the same leak path that bit model_refusal in the v1 review.
   */
  userMessage(): string;
}

/**
 * Canonical pattern set from spec 014. Patterns are checked in declaration
 * order — first match wins. Pipelines may extend additively via hooks (see
 * docs/spec/openclaw-v1/013-hooks.md).
 */
const RULES: ReadonlyArray<PatternRule> = [
  // Auth errors — non-retryable, surface to user
  {
    patterns: [
      "authentication_error",
      "failed to authenticate",
      "api error: 401",
      "invalid x-api-key",
      "invalid api key",
      "invalid_api_key",
      "unauthorized",
    ],
    category: "auth_error",
    retryable: false,
    userMessage: () =>
      "The agent could not authenticate with its LLM provider. Update the provider credentials and try again.",
  },
  // Context too long — retryable via compaction
  {
    patterns: ["context_length", "prompt is too long", "maximum context length", "token limit"],
    category: "context_too_long",
    retryable: true,
    userMessage: () =>
      "The conversation exceeded the model's context window. Compacting context and retrying.",
  },
  // Rate limit — retryable with backoff
  {
    patterns: ["rate_limit", "rate limit", "429", "too many requests", "quota exceeded"],
    category: "rate_limit",
    retryable: true,
    userMessage: () => "Rate limited by the LLM provider. Waiting before retrying.",
  },
  // Model refusal — retryable with rephrased prompt
  {
    patterns: [
      "failed_generation",
      "failed to call a function",
      "content_filter",
      "model refused",
    ],
    category: "model_refusal",
    retryable: true,
    userMessage: () =>
      "The model could not generate a response. Retrying with a simplified prompt.",
  },
  // Gateway timeout — retryable with longer timeout
  {
    patterns: [
      "timeout",
      "timed out",
      "econnreset",
      "socket hang up",
      "gateway timeout",
    ],
    category: "gateway_timeout",
    retryable: true,
    userMessage: () => "The gateway connection timed out. Retrying with a longer timeout.",
  },
  // Sandbox unavailable — retryable with wait
  {
    patterns: [
      "sandbox not found",
      "container not running",
      "no such container",
      "sandbox unavailable",
      "502",
      "503",
      "service unavailable",
    ],
    category: "sandbox_unavailable",
    retryable: true,
    userMessage: () =>
      "The sandbox container is temporarily unavailable. Waiting before retrying.",
  },
  // Manifest invalid — non-retryable, surface to architect
  {
    patterns: [
      "manifest",
      "schema validation failed",
      "manifest drift",
      "tool_kind unknown",
    ],
    category: "manifest_invalid",
    retryable: false,
    userMessage: () =>
      "The pipeline manifest failed validation. Regenerate the manifest and try again.",
  },
  // Permission denied — non-retryable, agent must change approach
  {
    patterns: [
      "permission denied",
      "requires approval",
      "not allowed in build mode",
    ],
    category: "permission_denied",
    retryable: false,
    userMessage: () =>
      "The operation was denied by the runtime's permission policy.",
  },
  // Malformed response — retryable with simplified prompt
  // Note: must come AFTER manifest_invalid (which uses 'schema validation failed')
  {
    patterns: ["json", "parse error", "unexpected token", "malformed", "invalid json"],
    category: "malformed_response",
    retryable: true,
    userMessage: () => "Received a malformed response. Retrying with a clearer prompt.",
  },
  // Network errors — retryable
  {
    patterns: ["econnrefused", "enotfound", "network", "fetch failed", "dns"],
    category: "network_error",
    retryable: true,
    userMessage: () => "Network error connecting to the gateway. Retrying.",
  },
];

// ─── Classification API ────────────────────────────────────────────────

/**
 * Classify an error message into a category with retry/recovery guidance.
 * Unknown errors classify as 'unknown' with retryable: true (cautious default).
 */
export function classifyError(error: unknown): ClassifiedError {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const normalized = errorMsg.toLowerCase();

  for (const rule of RULES) {
    if (rule.patterns.some((p) => normalized.includes(p))) {
      return {
        category: rule.category,
        retryable: rule.retryable,
        originalMessage: errorMsg,
        userMessage: rule.userMessage(),
      };
    }
  }

  return {
    category: "unknown",
    retryable: true,
    originalMessage: errorMsg,
    // Don't embed the raw originalMessage — it may carry secrets or
    // implementation details that flow to AG-UI before decision-log
    // redaction runs. The full (redacted) original lives in the decision
    // log; the operator looks there for details.
    userMessage:
      "An unexpected error occurred. See the decision log for details.",
  };
}

/**
 * Classify a tool execution error specifically. If no pattern matches, falls
 * through to 'tool_execution_failure' (a more specific 'unknown') with the
 * tool name preserved.
 */
export function classifyToolError(toolName: string, error: unknown): ClassifiedError {
  const base = classifyError(error);
  if (base.category === "unknown") {
    return {
      ...base,
      category: "tool_execution_failure",
      toolName,
      // Same reason as the `unknown` branch above — never embed raw
      // originalMessage in the user-facing string.
      userMessage: `Tool "${toolName}" failed unexpectedly. See the decision log for details.`,
    };
  }
  return { ...base, toolName };
}
