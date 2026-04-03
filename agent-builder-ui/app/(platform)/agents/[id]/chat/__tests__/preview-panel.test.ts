/**
 * preview-panel.test.ts — Verify PreviewPanel component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("PreviewPanel", () => {
  test("exports PreviewPanel as a default export", async () => {
    const mod = await import("../_components/PreviewPanel");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
