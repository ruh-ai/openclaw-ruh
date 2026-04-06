/**
 * code-editor-panel.test.ts — Verify CodeEditorPanel component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/openclaw/files-workspace", () => ({
  createWorkspaceApiUrl: () => "",
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("CodeEditorPanel", () => {
  test("exports CodeEditorPanel as a default export", async () => {
    const mod = await import("../_components/CodeEditorPanel");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
