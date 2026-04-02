/**
 * task-progress-header.test.ts — Verify TaskProgressHeader component exports.
 */
import { describe, expect, test } from "bun:test";

describe("TaskProgressHeader", () => {
  test("exports TaskProgressHeader as a default export", async () => {
    const mod = await import("../_components/TaskProgressHeader");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
