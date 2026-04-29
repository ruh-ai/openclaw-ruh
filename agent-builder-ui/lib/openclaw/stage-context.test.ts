import { describe, expect, test } from "bun:test";
import { resolveStageContext } from "./stage-context";

describe("resolveStageContext", () => {
  test("marks PRD revision context when Think has PRD but not approved", () => {
    const ctx = resolveStageContext({
      devStage: "think",
      thinkStatus: "ready",
      planStatus: "idle",
      buildStatus: "idle",
      deployStatus: "idle",
      discoveryDocuments: { prd: { title: "PRD", sections: [] }, trd: null },
      architecturePlan: null,
      buildManifest: null,
      buildReport: null,
      selectedArtifact: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
    });

    expect(ctx.mode).toBe("revise");
    expect(ctx.primaryArtifact?.kind).toBe("prd");
    expect(ctx.allowedActions).toContain("request_changes");
    expect(ctx.allowedActions).toContain("approve");
  });

  test("blocks ship context until test readiness is backend-confirmed", () => {
    const ctx = resolveStageContext({
      devStage: "ship",
      thinkStatus: "done",
      planStatus: "done",
      buildStatus: "done",
      deployStatus: "idle",
      discoveryDocuments: null,
      architecturePlan: null,
      buildManifest: null,
      buildReport: { readiness: "blocked", checks: [] },
      selectedArtifact: null,
    });

    expect(ctx.allowedActions).not.toContain("ship");
    expect(ctx.readiness).toBe("blocked");
  });

  test("does not expose Plan approval for an empty architecture plan", () => {
    const ctx = resolveStageContext({
      devStage: "plan",
      thinkStatus: "approved",
      planStatus: "ready",
      buildStatus: "idle",
      deployStatus: "idle",
      discoveryDocuments: null,
      architecturePlan: { skills: [], workflow: { steps: [] } },
      buildManifest: null,
      buildReport: null,
      selectedArtifact: null,
    });

    expect(ctx.readiness).toBe("draft");
    expect(ctx.allowedActions).not.toContain("approve");
  });

  test("exposes Prototype approval when dashboard prototype is present", () => {
    const ctx = resolveStageContext({
      devStage: "prototype",
      thinkStatus: "approved",
      planStatus: "approved",
      buildStatus: "idle",
      deployStatus: "idle",
      discoveryDocuments: null,
      architecturePlan: {
        skills: [{ id: "review-project" }],
        workflow: { steps: [{ skillId: "review-project" }] },
        dashboardPages: [{ path: "/projects", title: "Projects" }],
        dashboardPrototype: {
          summary: "ECC estimator dashboard prototype",
          workflows: [{ id: "review", name: "Review", steps: ["Open project"], requiredActions: [], successCriteria: [] }],
          pages: [{ path: "/projects", title: "Projects", purpose: "Review estimates" }],
        },
      },
      buildManifest: null,
      buildReport: null,
      selectedArtifact: null,
    });

    expect(ctx.readiness).toBe("ready");
    expect(ctx.allowedActions).toContain("approve");
  });

  test("blocks Prototype approval when dashboard pages lack a prototype", () => {
    const ctx = resolveStageContext({
      devStage: "prototype",
      thinkStatus: "approved",
      planStatus: "approved",
      buildStatus: "idle",
      deployStatus: "idle",
      discoveryDocuments: null,
      architecturePlan: {
        skills: [{ id: "review-project" }],
        workflow: { steps: [{ skillId: "review-project" }] },
        dashboardPages: [{ path: "/projects", title: "Projects" }],
      },
      buildManifest: null,
      buildReport: null,
      selectedArtifact: null,
    });

    expect(ctx.readiness).toBe("blocked");
    expect(ctx.allowedActions).not.toContain("approve");
  });
});
