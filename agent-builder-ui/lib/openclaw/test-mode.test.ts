import { describe, expect, test } from "bun:test";

import {
  buildGatewaySessionKey,
  buildGatewayUserMessage,
} from "./test-mode";

describe("test-mode helpers", () => {
  test("uses isolated named-agent session keys for builder modes", () => {
    expect(buildGatewaySessionKey("architect", "abc123", "test")).toBe(
      "agent:test:abc123"
    );
    expect(buildGatewaySessionKey("architect", "abc123", "build")).toBe(
      "agent:architect:abc123"
    );
    expect(buildGatewaySessionKey("architect", "abc123", "copilot")).toBe(
      "agent:copilot:abc123"
    );
    expect(buildGatewaySessionKey("architect", "abc123", "reveal")).toBe(
      "agent:reveal:abc123"
    );
  });

  test("injects SOUL content ahead of the user prompt in test mode", () => {
    expect(
      buildGatewayUserMessage("What can you do?", {
        mode: "test",
        soulOverride: "# You are Review Agent\n- Help with QA",
      })
    ).toBe(
      "[SYSTEM]\n# You are Review Agent\n- Help with QA\n\n[USER]\nWhat can you do?"
    );
  });

  test("leaves ordinary architect messages unchanged outside test mode", () => {
    expect(
      buildGatewayUserMessage("Build me a support bot", {
        mode: "build",
        soulOverride: "# Ignored",
      })
    ).toBe("Build me a support bot");
  });
});
