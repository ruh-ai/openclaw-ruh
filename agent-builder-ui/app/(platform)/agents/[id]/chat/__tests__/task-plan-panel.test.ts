/**
 * task-plan-panel.test.ts — Verify TaskPlanPanel component exports.
 */
import { describe, expect, test } from "bun:test";

describe("TaskPlanPanel", () => {
  test("exports TaskPlanPanel as a default export", async () => {
    const mod = await import("../_components/TaskPlanPanel");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
