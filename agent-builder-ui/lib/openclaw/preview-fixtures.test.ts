import { describe, test, expect } from "bun:test";
import { synthesizeFixtures, fixtureFor } from "./preview-fixtures";
import type { ArchitecturePlan } from "./types";

const minimalPlan: Partial<ArchitecturePlan> = {
  dashboardPages: [
    {
      path: "/deals",
      title: "Deals",
      components: [
        { type: "metric-cards", dataSource: "/api/deals/summary" },
        { type: "data-table", dataSource: "/api/deals" },
        { type: "bar-chart", dataSource: "/api/deals/trend" },
      ],
    },
  ],
};

describe("synthesizeFixtures", () => {
  test("produces a fixture for every dataSource referenced by the plan", () => {
    const fixtures = synthesizeFixtures(minimalPlan as ArchitecturePlan);
    expect(Object.keys(fixtures).sort()).toEqual([
      "/api/deals",
      "/api/deals/summary",
      "/api/deals/trend",
    ]);
  });

  test("data-table fixture carries items[]", () => {
    const fixtures = synthesizeFixtures(minimalPlan as ArchitecturePlan);
    const fixture = fixtureFor(fixtures, "/api/deals");
    expect(fixture?.items?.length ?? 0).toBeGreaterThan(0);
  });

  test("metric-cards fixture carries metrics{}", () => {
    const fixtures = synthesizeFixtures(minimalPlan as ArchitecturePlan);
    const fixture = fixtureFor(fixtures, "/api/deals/summary");
    expect(Object.keys(fixture?.metrics ?? {}).length).toBeGreaterThan(0);
  });

  test("chart fixture carries series[]", () => {
    const fixtures = synthesizeFixtures(minimalPlan as ArchitecturePlan);
    const fixture = fixtureFor(fixtures, "/api/deals/trend");
    expect((fixture?.series ?? []).length).toBeGreaterThan(0);
  });

  test("architect-supplied previewFixtures win over synthesized values", () => {
    const planWithSeed: Partial<ArchitecturePlan> = {
      ...minimalPlan,
      previewFixtures: {
        "/api/deals": { items: [{ name: "Architect-provided" }] },
      },
    };
    const fixtures = synthesizeFixtures(planWithSeed as ArchitecturePlan);
    expect(fixtures["/api/deals"].items?.[0]?.name).toBe("Architect-provided");
  });

  test("dataSource with query string is keyed by path only", () => {
    const fixtures = synthesizeFixtures({
      dashboardPages: [
        {
          path: "/x",
          title: "x",
          components: [{ type: "data-table", dataSource: "/api/foo?limit=10" }],
        },
      ],
    } as ArchitecturePlan);
    expect(fixtures["/api/foo"]).toBeDefined();
    expect(fixtureFor(fixtures, "/api/foo?bar=baz")).toBeDefined();
  });

  test("returns an empty object for a plan without dashboard pages", () => {
    expect(synthesizeFixtures(null)).toEqual({});
    expect(synthesizeFixtures({} as ArchitecturePlan)).toEqual({});
  });
});
