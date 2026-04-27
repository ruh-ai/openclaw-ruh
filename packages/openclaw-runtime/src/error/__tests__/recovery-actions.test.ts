import { describe, expect, test } from "bun:test";
import { getRecoveryAction } from "../recovery-actions";
import type { ClassifiedError } from "../error-taxonomy";

function makeClassified(category: ClassifiedError["category"], message = "test"): ClassifiedError {
  return {
    category,
    retryable: true,
    originalMessage: message,
    userMessage: message,
  };
}

describe("getRecoveryAction", () => {
  test("context_too_long → compact_context with maxPromptTokens", () => {
    const action = getRecoveryAction(makeClassified("context_too_long"));
    expect(action.type).toBe("compact_context");
    expect(action.modifications.maxPromptTokens).toBe(80_000);
  });

  test("rate_limit → wait_and_retry, no modifications (delay handled by retry)", () => {
    const action = getRecoveryAction(makeClassified("rate_limit"));
    expect(action.type).toBe("wait_and_retry");
    expect(action.modifications).toEqual({});
  });

  test("auth_error → none", () => {
    const action = getRecoveryAction(makeClassified("auth_error"));
    expect(action.type).toBe("none");
  });

  test("gateway_timeout → extend_timeout with timeoutMultiplier", () => {
    const action = getRecoveryAction(makeClassified("gateway_timeout"));
    expect(action.type).toBe("extend_timeout");
    expect(action.modifications.timeoutMultiplier).toBe(1.5);
  });

  test("malformed_response → simplify_prompt", () => {
    const action = getRecoveryAction(makeClassified("malformed_response"));
    expect(action.type).toBe("simplify_prompt");
    expect(action.modifications.simplifyInstruction).toBe(true);
  });

  test("model_refusal → simplify_prompt", () => {
    const action = getRecoveryAction(makeClassified("model_refusal"));
    expect(action.type).toBe("simplify_prompt");
  });

  test("tool_execution_failure → provide_error_context with the original message embedded", () => {
    const classified = makeClassified("tool_execution_failure", "disk full while writing");
    const action = getRecoveryAction(classified);
    expect(action.type).toBe("provide_error_context");
    expect(action.modifications.appendToPrompt).toContain("disk full while writing");
    expect(action.modifications.appendToPrompt).toContain("[PREVIOUS ERROR]");
  });

  test("manifest_invalid + permission_denied + eval_failure → none (no auto-recovery)", () => {
    expect(getRecoveryAction(makeClassified("manifest_invalid")).type).toBe("none");
    expect(getRecoveryAction(makeClassified("permission_denied")).type).toBe("none");
    expect(getRecoveryAction(makeClassified("eval_failure")).type).toBe("none");
  });

  test("unknown → provide_error_context with raw message", () => {
    const classified = makeClassified("unknown", "weird thing happened");
    const action = getRecoveryAction(classified);
    expect(action.type).toBe("provide_error_context");
    expect(action.modifications.appendToPrompt).toContain("weird thing happened");
  });

  test("description is non-empty for every category", () => {
    const categories = [
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
    ] as const;

    for (const category of categories) {
      const action = getRecoveryAction(makeClassified(category));
      expect(action.description.length).toBeGreaterThan(0);
    }
  });
});
