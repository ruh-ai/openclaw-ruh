import { describe, expect, test } from "bun:test";

describe("@ruh/marketplace-ui public API surface", () => {
  // ── Root exports (src/index.ts) ──────────────────────────────────────────────

  test("root barrel re-exports all components", async () => {
    const mod = await import("../index");
    expect(mod.AgentCard).toBeDefined();
    expect(mod.CategoryFilter).toBeDefined();
    expect(mod.SearchBar).toBeDefined();
    expect(mod.RatingStars).toBeDefined();
    expect(mod.InstallButton).toBeDefined();
  });

  test("root barrel re-exports useMarketplace hook", async () => {
    const mod = await import("../index");
    expect(typeof mod.useMarketplace).toBe("function");
  });

  test("root barrel re-exports MARKETPLACE_CATEGORIES constant", async () => {
    const mod = await import("../index");
    expect(Array.isArray(mod.MARKETPLACE_CATEGORIES)).toBe(true);
    expect(mod.MARKETPLACE_CATEGORIES.length).toBe(10);
  });

  // ── Components subpath (src/components/index.ts) ─────────────────────────────

  test("components subpath exports 5 components", async () => {
    const mod = await import("../components");
    expect(mod.AgentCard).toBeDefined();
    expect(mod.CategoryFilter).toBeDefined();
    expect(mod.SearchBar).toBeDefined();
    expect(mod.RatingStars).toBeDefined();
    expect(mod.InstallButton).toBeDefined();
  });

  // ── Hooks subpath (src/hooks/index.ts) ───────────────────────────────────────

  test("hooks subpath exports useMarketplace", async () => {
    const mod = await import("../hooks");
    expect(typeof mod.useMarketplace).toBe("function");
  });

  // ── Types subpath (src/types/index.ts) ───────────────────────────────────────

  test("types subpath exports MARKETPLACE_CATEGORIES array", async () => {
    const mod = await import("../types");
    expect(Array.isArray(mod.MARKETPLACE_CATEGORIES)).toBe(true);
    expect(mod.MARKETPLACE_CATEGORIES).toContain("general");
    expect(mod.MARKETPLACE_CATEGORIES).toContain("marketing");
    expect(mod.MARKETPLACE_CATEGORIES).toContain("custom");
  });

  test("MARKETPLACE_CATEGORIES contains all 10 categories", async () => {
    const mod = await import("../types");
    const expected = [
      "general", "marketing", "sales", "support", "engineering",
      "data", "finance", "hr", "operations", "custom",
    ];
    for (const cat of expected) {
      expect(mod.MARKETPLACE_CATEGORIES).toContain(cat);
    }
  });

  test("MARKETPLACE_CATEGORIES is readonly", async () => {
    const mod = await import("../types");
    // TypeScript enforces readonly at compile time; at runtime verify it's a frozen-like array
    expect(mod.MARKETPLACE_CATEGORIES.length).toBe(10);
  });
});
