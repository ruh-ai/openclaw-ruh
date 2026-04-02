/**
 * browser-panel.test.ts — Verify BrowserPanel component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/openclaw/browser-workspace", () => ({
  createEmptyBrowserWorkspaceState: () => ({ items: [], takeover: null }),
}));

mock.module("../_components/LiveBrowserView", () => ({
  default: () => null,
}));

describe("BrowserPanel", () => {
  test("exports BrowserPanel as a default export", async () => {
    const mod = await import("../_components/BrowserPanel");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
