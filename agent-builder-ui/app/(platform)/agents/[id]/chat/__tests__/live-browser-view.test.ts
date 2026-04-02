/**
 * live-browser-view.test.ts — Verify LiveBrowserView component exports.
 */
import { describe, expect, test } from "bun:test";

describe("LiveBrowserView", () => {
  test("exports LiveBrowserView as a default export", async () => {
    const mod = await import("../_components/LiveBrowserView");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("exports BrowserAction type (module is importable)", async () => {
    // BrowserAction is an interface so it won't be in runtime exports,
    // but the module should load without errors
    const mod = await import("../_components/LiveBrowserView");
    expect(mod).toBeDefined();
  });
});
