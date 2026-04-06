/**
 * task-progress-footer.test.ts — Verify TaskProgressFooter component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("TaskProgressFooter", () => {
  test("exports TaskProgressFooter as a default export", async () => {
    const mod = await import("../_components/TaskProgressFooter");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
