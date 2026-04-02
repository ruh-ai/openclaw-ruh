/**
 * tab-skills.test.ts — Verify TabSkills component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => null,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("TabSkills", () => {
  test("exports TabSkills as a named export", async () => {
    const mod = await import("../_components/TabSkills");
    expect(mod.TabSkills).toBeDefined();
    expect(typeof mod.TabSkills).toBe("function");
  });
});
