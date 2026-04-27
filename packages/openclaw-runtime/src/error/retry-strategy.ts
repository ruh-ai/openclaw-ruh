/**
 * Retry strategy with exponential backoff, jitter, and per-category config.
 *
 * Implements: docs/spec/openclaw-v1/014-error-taxonomy.md#retry-strategy
 *
 * Each error category has its own retry parameters. The strategy decides
 * whether to retry, how long to wait, and when to give up. Backoff includes
 * 0-25% jitter to prevent thundering-herd retries.
 */

import type { ErrorCategory, ClassifiedError } from "./error-taxonomy";
import { classifyError } from "./error-taxonomy";

// ─── Config per category ───────────────────────────────────────────────

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Multiplier applied each attempt (exponential backoff). */
  readonly backoffFactor: number;
}

/**
 * Canonical defaults from spec 014. Pipelines may override per category in
 * pipeline-manifest.json's retry_overrides field.
 */
export const DEFAULT_RETRY_CONFIGS: Readonly<Record<ErrorCategory, RetryConfig>> = {
  context_too_long: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
  rate_limit: { maxAttempts: 4, baseDelayMs: 2000, maxDelayMs: 30000, backoffFactor: 2 },
  auth_error: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
  gateway_timeout: { maxAttempts: 3, baseDelayMs: 3000, maxDelayMs: 15000, backoffFactor: 1.5 },
  malformed_response: { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2000, backoffFactor: 1 },
  tool_execution_failure: {
    maxAttempts: 2,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    backoffFactor: 1.5,
  },
  sandbox_unavailable: {
    maxAttempts: 3,
    baseDelayMs: 5000,
    maxDelayMs: 20000,
    backoffFactor: 2,
  },
  model_refusal: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 5000, backoffFactor: 1 },
  network_error: { maxAttempts: 3, baseDelayMs: 2000, maxDelayMs: 10000, backoffFactor: 2 },
  manifest_invalid: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
  permission_denied: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
  eval_failure: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
  unknown: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 5000, backoffFactor: 1.5 },
};

// ─── Strategy ──────────────────────────────────────────────────────────

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs: number;
  readonly attempt: number;
  readonly maxAttempts: number;
}

/** Get the retry config for a category, with optional per-call overrides. */
export function getRetryConfig(
  category: ErrorCategory,
  overrides?: Partial<RetryConfig>,
): RetryConfig {
  const base = DEFAULT_RETRY_CONFIGS[category];
  if (!overrides) return base;
  return {
    maxAttempts: overrides.maxAttempts ?? base.maxAttempts,
    baseDelayMs: overrides.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: overrides.maxDelayMs ?? base.maxDelayMs,
    backoffFactor: overrides.backoffFactor ?? base.backoffFactor,
  };
}

/**
 * Compute the delay for a given attempt using exponential backoff + jitter.
 * Optional jitterFn lets tests inject deterministic randomness.
 */
export function computeDelay(
  config: RetryConfig,
  attempt: number,
  jitterFn: () => number = Math.random,
): number {
  if (config.baseDelayMs === 0) return 0;
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  const capped = Math.min(exponentialDelay, config.maxDelayMs);
  // 0-25% jitter to prevent thundering herd
  const jitter = capped * jitterFn() * 0.25;
  return Math.round(capped + jitter);
}

/**
 * Decide whether to retry. attempt is 1-based — first failure = attempt 1.
 */
export function shouldRetry(
  category: ErrorCategory,
  attempt: number,
  overrides?: Partial<RetryConfig>,
  jitterFn: () => number = Math.random,
): RetryDecision {
  const config = getRetryConfig(category, overrides);

  if (attempt >= config.maxAttempts) {
    return { shouldRetry: false, delayMs: 0, attempt, maxAttempts: config.maxAttempts };
  }

  return {
    shouldRetry: true,
    delayMs: computeDelay(config, attempt, jitterFn),
    attempt,
    maxAttempts: config.maxAttempts,
  };
}

// ─── withRetry ─────────────────────────────────────────────────────────

export interface WithRetryOptions {
  readonly classify?: (error: unknown) => ClassifiedError;
  readonly overrides?: Partial<Record<ErrorCategory, Partial<RetryConfig>>>;
  readonly onRetry?: (
    decision: RetryDecision,
    classified: ClassifiedError,
    error: unknown,
  ) => void | Promise<void>;
  /** Override the sleep function (test seam). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Override the jitter function (test seam). */
  readonly jitter?: () => number;
  /** Optional abort signal — when aborted, withRetry rejects with the abort reason. */
  readonly signal?: AbortSignal;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });

/**
 * Execute a function with automatic retries based on classified error.
 *
 *   - Re-throws non-retryable errors immediately
 *   - Retries retryable errors up to maxAttempts with computed delay
 *   - Calls onRetry between attempts (for decision-log emission, dashboard, etc.)
 *   - Aborts cleanly if signal triggers
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const classify = options.classify ?? classifyError;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? Math.random;
  let attempt = 0;

  // Track non-retryable rethrows so we always escape with a real error,
  // never an undefined value from a misuse.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("aborted");
    }

    attempt++;
    try {
      return await fn();
    } catch (error) {
      const classified = classify(error);

      if (!classified.retryable) {
        throw error;
      }

      const overrides = options.overrides?.[classified.category];
      const decision = shouldRetry(classified.category, attempt, overrides, jitter);
      if (!decision.shouldRetry) {
        throw error;
      }

      if (options.onRetry) {
        await options.onRetry(decision, classified, error);
      }

      if (decision.delayMs > 0) {
        await sleep(decision.delayMs);
      }
    }
  }
}
