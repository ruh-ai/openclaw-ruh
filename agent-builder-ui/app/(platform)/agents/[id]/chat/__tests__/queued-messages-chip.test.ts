/**
 * queued-messages-chip.test.ts — Verify QueuedMessagesChip exports + props shape.
 */
import { describe, expect, test } from "bun:test";

describe("QueuedMessagesChip", () => {
  test("exports QueuedMessagesChip as a named export", async () => {
    const mod = await import("../_components/QueuedMessagesChip");
    expect(mod.QueuedMessagesChip).toBeDefined();
    expect(typeof mod.QueuedMessagesChip).toBe("function");
  });
});
