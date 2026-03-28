import { describe, expect, test, beforeEach } from "bun:test";

import { PHASE_ORDER, useCoPilotStore } from "./copilot-state";

describe("copilot-state", () => {
  test("includes the runtime inputs phase between tools and triggers", () => {
    useCoPilotStore.getState().reset();
    expect(PHASE_ORDER).toEqual([
      "purpose",
      "discovery",
      "skills",
      "tools",
      "runtime_inputs",
      "triggers",
      "channels",
      "review",
    ]);
  });

  test("hydrates and snapshots runtime inputs alongside the rest of the copilot session", () => {
    useCoPilotStore.getState().reset();
    useCoPilotStore.getState().hydrateFromSeed({
      runtimeInputs: [
        {
          key: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Google Ads Customer ID",
          description: "Customer account id for runtime API calls.",
          required: true,
          source: "architect_requirement",
          value: "123-456-7890",
        },
      ],
    });

    expect(useCoPilotStore.getState().snapshot().runtimeInputs).toEqual([
      {
        key: "GOOGLE_ADS_CUSTOMER_ID",
        label: "Google Ads Customer ID",
        description: "Customer account id for runtime API calls.",
        required: true,
        source: "architect_requirement",
        value: "123-456-7890",
      },
    ]);
  });
});

// ── Batch 1 UX fixes ────────────────────────────────────────────────────────

describe("goBackDevStage", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("resets planStatus to idle when going back to plan", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", planStatus: "approved" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("plan");
    expect(store.getState().planStatus).toBe("idle");
  });

  test("resets buildStatus to idle when going back to build", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "review", buildStatus: "done" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("build");
    expect(store.getState().buildStatus).toBe("idle");
  });

  test("resets thinkStatus when going back to think", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", thinkStatus: "approved" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("think");
    expect(store.getState().thinkStatus).toBe("idle");
  });

  test("does nothing at think stage (no underflow)", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "think" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("think");
  });

  test("does not reset unrelated statuses", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", planStatus: "approved", thinkStatus: "approved", buildStatus: "done" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("plan");
    expect(store.getState().planStatus).toBe("idle");
    expect(store.getState().thinkStatus).toBe("approved"); // should NOT be reset
  });
});

describe("advanceDevStage", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("sets evalStatus to done when skipping tests", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "test", evalStatus: "idle" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("ship");
    expect(store.getState().evalStatus).toBe("done");
  });

  test("sets evalStatus to done when running tests are skipped", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "test", evalStatus: "running" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("ship");
    expect(store.getState().evalStatus).toBe("done");
  });

  test("does not touch evalStatus when advancing from plan to build", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", evalStatus: "idle" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("build");
    expect(store.getState().evalStatus).toBe("idle");
  });

  test("does nothing at reflect stage (no overflow)", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "reflect" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("reflect");
  });
});
