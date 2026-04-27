// Public surface of the error module.

export type { ErrorCategory, ClassifiedError } from "./error-taxonomy";
export { ERROR_CATEGORIES, classifyError, classifyToolError } from "./error-taxonomy";

export type { RetryConfig, RetryDecision, WithRetryOptions } from "./retry-strategy";
export {
  DEFAULT_RETRY_CONFIGS,
  getRetryConfig,
  computeDelay,
  shouldRetry,
  withRetry,
} from "./retry-strategy";

export type {
  RecoveryActionType,
  RecoveryModifications,
  RecoveryAction,
} from "./recovery-actions";
export { getRecoveryAction } from "./recovery-actions";
