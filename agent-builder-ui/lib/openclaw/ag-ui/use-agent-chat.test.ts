/**
 * use-agent-chat.test.ts — Verify exports from the useAgentChat hook module.
 *
 * The hook itself requires a full React + AG-UI runtime, so we verify
 * that the module exports are correct and the hook is importable.
 */
import { describe, expect, test } from "bun:test";

describe("useAgentChat module", () => {
  test("exports useAgentChat as a function", async () => {
    const mod = await import("./use-agent-chat");
    expect(typeof mod.useAgentChat).toBe("function");
  });
});
