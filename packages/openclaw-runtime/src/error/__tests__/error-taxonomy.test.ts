import { describe, expect, test } from "bun:test";
import {
  classifyError,
  classifyToolError,
  ERROR_CATEGORIES,
} from "../error-taxonomy";

describe("classifyError", () => {
  test("auth_error: detects 401 and unauthorized", () => {
    const a = classifyError(new Error("API error: 401 Unauthorized"));
    expect(a.category).toBe("auth_error");
    expect(a.retryable).toBe(false);

    const b = classifyError("authentication_error: invalid api key");
    expect(b.category).toBe("auth_error");
  });

  test("rate_limit: detects 429 and rate limit", () => {
    const a = classifyError("Rate limit exceeded: 429");
    expect(a.category).toBe("rate_limit");
    expect(a.retryable).toBe(true);

    const b = classifyError("too many requests");
    expect(b.category).toBe("rate_limit");

    const c = classifyError("quota exceeded for the period");
    expect(c.category).toBe("rate_limit");
  });

  test("context_too_long: detects context_length and prompt is too long", () => {
    const a = classifyError("context_length exceeded");
    expect(a.category).toBe("context_too_long");
    expect(a.retryable).toBe(true);

    const b = classifyError("the prompt is too long for the model");
    expect(b.category).toBe("context_too_long");
  });

  test("gateway_timeout: detects timeout, ECONNRESET, socket hang up", () => {
    expect(classifyError("request timed out after 30s").category).toBe("gateway_timeout");
    expect(classifyError("ECONNRESET").category).toBe("gateway_timeout");
    expect(classifyError("socket hang up").category).toBe("gateway_timeout");
  });

  test("sandbox_unavailable: detects 502, 503, container not running", () => {
    expect(classifyError("502 Bad Gateway").category).toBe("sandbox_unavailable");
    expect(classifyError("HTTP 503 Service Unavailable").category).toBe("sandbox_unavailable");
    expect(classifyError("container not running").category).toBe("sandbox_unavailable");
  });

  test("malformed_response: detects JSON parse errors", () => {
    expect(classifyError("Unexpected token in JSON").category).toBe("malformed_response");
    expect(classifyError("invalid json from model").category).toBe("malformed_response");
  });

  test("model_refusal: detects content_filter and failed_generation", () => {
    expect(classifyError("content_filter triggered").category).toBe("model_refusal");
    expect(classifyError("failed_generation").category).toBe("model_refusal");
  });

  test("network_error: detects ECONNREFUSED, DNS failures", () => {
    expect(classifyError("ECONNREFUSED").category).toBe("network_error");
    expect(classifyError("ENOTFOUND example.com").category).toBe("network_error");
    expect(classifyError("DNS resolution failed").category).toBe("network_error");
  });

  test("manifest_invalid: detects manifest drift and schema validation", () => {
    expect(classifyError("manifest drift detected").category).toBe("manifest_invalid");
    expect(classifyError("schema validation failed").category).toBe("manifest_invalid");
  });

  test("permission_denied: detects requires approval", () => {
    expect(classifyError("permission denied for tool").category).toBe("permission_denied");
    expect(classifyError("requires approval").category).toBe("permission_denied");
  });

  test("unknown: falls through with retryable=true (cautious default)", () => {
    const a = classifyError("something completely unexpected went wrong");
    expect(a.category).toBe("unknown");
    expect(a.retryable).toBe(true);
    expect(a.userMessage).toContain("unexpected error");
  });

  test("unknown: userMessage does NOT embed raw originalMessage (regression — would leak secrets to AG-UI)", () => {
    const c = classifyError("disk full token=opaquesecretvalue1234567890");
    expect(c.category).toBe("unknown");
    expect(c.originalMessage).toContain("opaquesecretvalue1234567890");
    expect(c.userMessage).not.toContain("opaquesecretvalue1234567890");
    expect(c.userMessage).not.toContain("disk full");
  });

  test("preserves original message and produces a sanitized userMessage", () => {
    const c = classifyError("API error: 401 — secret token sk_live_abc123 used");
    expect(c.originalMessage).toContain("sk_live_abc123"); // preserved for server-side debugging
    expect(c.userMessage).not.toContain("sk_live_abc123"); // sanitized for end users
  });

  test("classifies an Error object the same as its .message string", () => {
    const fromError = classifyError(new Error("rate limit exceeded"));
    const fromString = classifyError("rate limit exceeded");
    expect(fromError.category).toBe(fromString.category);
  });

  test("ERROR_CATEGORIES contains every category", () => {
    expect(ERROR_CATEGORIES).toHaveLength(13);
    expect(ERROR_CATEGORIES).toContain("rate_limit");
    expect(ERROR_CATEGORIES).toContain("manifest_invalid");
    expect(ERROR_CATEGORIES).toContain("eval_failure");
  });
});

describe("classifyToolError", () => {
  test("attaches toolName and falls through to tool_execution_failure for unknown patterns", () => {
    const result = classifyToolError("workspace-write", new Error("disk full"));
    expect(result.category).toBe("tool_execution_failure");
    expect(result.toolName).toBe("workspace-write");
    expect(result.userMessage).toContain("workspace-write");
  });

  test("tool_execution_failure userMessage does NOT embed raw originalMessage (regression — would leak secrets to AG-UI)", () => {
    const result = classifyToolError(
      "workspace-write",
      new Error("disk full token=opaquesecretvalue1234567890"),
    );
    expect(result.userMessage).not.toContain("opaquesecretvalue1234567890");
    expect(result.userMessage).not.toContain("disk full");
    expect(result.originalMessage).toContain("opaquesecretvalue1234567890");
  });

  test("preserves classification for known patterns and adds toolName", () => {
    const result = classifyToolError("research", "rate limit exceeded by upstream");
    expect(result.category).toBe("rate_limit");
    expect(result.toolName).toBe("research");
    expect(result.retryable).toBe(true);
  });
});
