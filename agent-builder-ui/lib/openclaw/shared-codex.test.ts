import { describe, expect, test } from "bun:test";
import {
  getEffectiveChatModel,
  getSharedCodexDisplayModel,
  sanitizeAgentModelForSandbox,
} from "./shared-codex";

describe("shared Codex sandbox helpers", () => {
  const sharedSandbox = {
    sandbox_id: "sb-shared-codex",
    shared_codex_enabled: true,
    shared_codex_model: "openai-codex/gpt-5.4",
  };

  test("clears a stale non-Codex agent model when sandbox is locked to shared Codex", () => {
    expect(sanitizeAgentModelForSandbox("claude-sonnet-4-6", sharedSandbox)).toBeUndefined();
  });

  test("preserves a shared Codex model when sandbox is locked to shared Codex", () => {
    expect(
      sanitizeAgentModelForSandbox("openai-codex/gpt-5.4", sharedSandbox),
    ).toBe("openai-codex/gpt-5.4");
  });

  test("preserves a legacy explicit model when sandbox is not shared Codex", () => {
    expect(
      sanitizeAgentModelForSandbox("claude-sonnet-4-6", {
        sandbox_id: "sb-legacy",
        shared_codex_enabled: false,
        shared_codex_model: null,
      }),
    ).toBe("claude-sonnet-4-6");
  });

  test("falls back to gateway default for chat on shared Codex sandboxes", () => {
    expect(getEffectiveChatModel("claude-sonnet-4-6", sharedSandbox)).toBe("openclaw-default");
    expect(getEffectiveChatModel(undefined, sharedSandbox)).toBe("openclaw-default");
  });

  test("returns the explicit model for non-shared sandboxes", () => {
    expect(
      getEffectiveChatModel("claude-sonnet-4-6", {
        sandbox_id: "sb-legacy",
        shared_codex_enabled: false,
        shared_codex_model: null,
      }),
    ).toBe("claude-sonnet-4-6");
  });

  test("reports the shared Codex display model from sandbox metadata", () => {
    expect(getSharedCodexDisplayModel(sharedSandbox)).toBe("openai-codex/gpt-5.4");
  });

  test("falls back to the default shared Codex display model when metadata is missing", () => {
    expect(
      getSharedCodexDisplayModel({
        sandbox_id: "sb-shared-codex-default",
        shared_codex_enabled: true,
      }),
    ).toBe("openai-codex/gpt-5.4");
  });
});
