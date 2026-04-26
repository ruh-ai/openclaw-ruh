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
});
