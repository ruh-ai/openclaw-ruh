/**
 * Regression test: the tokens embedded in every Build-emitted dashboard's
 * ui.tsx must derive from the shared @ruh/dashboard-primitives package.
 *
 * If anyone re-inlines token values into scaffoldTemplates.ts (the bug
 * class we just removed), this test fails — the embedded values would
 * diverge from the package, and the prototype-preview / live-dashboard
 * fidelity guarantee breaks.
 */

import { describe, expect, test } from "bun:test";
import { generateScaffoldFiles } from "../../src/scaffoldTemplates";
import { dashboardTokens } from "../../../packages/dashboard-primitives/src/tokens";

const MINIMAL_PLAN = {
  systemName: "x",
  skills: [],
  workflow: { steps: [] },
  integrations: [],
  triggers: [],
  channels: [],
  envVars: [],
  subAgents: [],
  missionControl: null,
  dataSchema: null,
  dashboardPages: [
    { path: "/x", title: "X", components: [{ type: "data-table", dataSource: "/api/x" }] },
  ],
} as never;

describe("dashboard-primitives source of truth", () => {
  test("emitted ui.tsx contains every token key + value from the shared package", () => {
    const files = generateScaffoldFiles(MINIMAL_PLAN, "X");
    const ui = files.find((f) => f.path === "dashboard/components/ui.tsx");
    expect(ui).toBeTruthy();
    const content = ui!.content;
    for (const [key, value] of Object.entries(dashboardTokens)) {
      // Each token key appears with its package value in single quotes
      expect(content).toContain(`${key}: '${value}'`);
    }
  });

  test("emitted ui.tsx has the exact token block produced by the shared package", () => {
    const files = generateScaffoldFiles(MINIMAL_PLAN, "X");
    const ui = files.find((f) => f.path === "dashboard/components/ui.tsx");
    expect(ui).toBeTruthy();
    const block = ui!.content.match(/export const tokens = \{[\s\S]*?\};/)?.[0];
    expect(block).toBeTruthy();
    // Reconstruct what the package values would render to
    const expected = "export const tokens = {\n" +
      Object.entries(dashboardTokens).map(([k, v]) => `  ${k}: '${v}',`).join("\n") +
      "\n};";
    expect(block).toBe(expected);
  });

  test("no inline color hex literals leak elsewhere in scaffoldTemplates' ui.tsx output", () => {
    const files = generateScaffoldFiles(MINIMAL_PLAN, "X");
    const ui = files.find((f) => f.path === "dashboard/components/ui.tsx");
    expect(ui).toBeTruthy();
    // The brand purple should appear once (inside the gradient string)
    // and via the `tokens.primary` reference — never as a duplicate
    // string literal elsewhere in this file.
    const occurrences = (ui!.content.match(/#ae00d0/g) ?? []).length;
    // Exactly two: in tokens.primary value AND in the gradient string.
    expect(occurrences).toBe(2);
  });
});
