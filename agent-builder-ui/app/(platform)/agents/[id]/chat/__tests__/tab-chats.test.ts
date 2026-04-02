/**
 * tab-chats.test.ts — Verify TabChats component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => null,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("TabChats", () => {
  test("exports TabChats as a named export", async () => {
    const mod = await import("../_components/TabChats");
    expect(mod.TabChats).toBeDefined();
    expect(typeof mod.TabChats).toBe("function");
  });
});
