import { describe, expect, test } from "bun:test";

import { classifyGatewayRunError } from "./error-classification";

describe("classifyGatewayRunError", () => {
  test("treats failover 401 authentication errors as terminal provider auth failures", () => {
    const errorMsg =
      'FailoverError: {"type":"result","subtype":"success","is_error":true,"duration_ms":514,"duration_api_ms":0,"num_turns":1,"result":"Failed to authenticate. API Error: 401 {\\"type\\":\\"error\\",\\"error\\":{\\"type\\":\\"authentication_error\\",\\"message\\":\\"invalid x-api-key\\"}}"}';

    const classification = classifyGatewayRunError(errorMsg);

    expect(classification.retryable).toBe(false);
    expect(classification.response).toBeDefined();
    expect(classification.response).toMatchObject({
      type: "error",
      error: errorMsg,
    });
    expect(classification.response?.content).toContain(
      "could not authenticate with its configured LLM provider"
    );
    expect(classification.response?.content).toContain(
      "Update the provider credentials or sandbox LLM settings"
    );
    expect(classification.response?.content).not.toContain(
      "Unable to reach the OpenClaw gateway"
    );
  });

  test("treats model limitation failures as terminal typed errors", () => {
    const errorMsg =
      "Execution halted: context_length exceeded after a failed_generation response";

    const classification = classifyGatewayRunError(errorMsg);

    expect(classification.retryable).toBe(false);
    expect(classification.response).toEqual({
      type: "error",
      error: errorMsg,
      content:
        "The agent encountered an error: Execution halted: context_length exceeded after a failed_generation response. This may be a model limitation — try simplifying your message or the agent model may need upgrading.",
    });
  });

  test("keeps unknown runtime errors retryable", () => {
    const classification = classifyGatewayRunError(
      "Agent execution error"
    );

    expect(classification.retryable).toBe(true);
    expect(classification.response).toBeNull();
  });
});
