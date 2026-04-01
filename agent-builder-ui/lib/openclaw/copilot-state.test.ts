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

  test("hydrateFromSeed infers the furthest unlocked stage from restored progress", () => {
    useCoPilotStore.getState().reset();
    useCoPilotStore.getState().hydrateFromSeed({
      devStage: "review",
      buildStatus: "done",
    });

    expect(useCoPilotStore.getState().devStage).toBe("review");
    expect(useCoPilotStore.getState().maxUnlockedDevStage).toBe("review");
  });

  test("setSkillGraph marks nodes with skill_md as built", () => {
    useCoPilotStore.getState().reset();
    useCoPilotStore.getState().setSkillGraph(
      [
        {
          skill_id: "inventory-monitor",
          name: "Inventory Monitor",
          description: "Poll Shopify inventory and detect threshold breaches.",
          depends_on: [],
          requires_env: [],
          skill_md: "# Inventory Monitor",
        } as any,
        {
          skill_id: "slack-alert-send",
          name: "Slack Alert Send",
          description: "Post the ranked report to Slack.",
          depends_on: [],
          requires_env: [],
        } as any,
      ],
      null,
      [],
    );

    expect(useCoPilotStore.getState().selectedSkillIds).toEqual([
      "inventory-monitor",
      "slack-alert-send",
    ]);
    expect(useCoPilotStore.getState().builtSkillIds).toEqual(["inventory-monitor"]);
  });
});

// ── Batch 1 UX fixes ────────────────────────────────────────────────────────

describe("goBackDevStage", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("resets planStatus to idle when going back to plan", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", maxUnlockedDevStage: "build", planStatus: "approved" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("plan");
    expect(store.getState().maxUnlockedDevStage).toBe("plan");
    expect(store.getState().planStatus).toBe("idle");
  });

  test("resets buildStatus to idle when going back to build", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "review", maxUnlockedDevStage: "review", buildStatus: "done" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("build");
    expect(store.getState().maxUnlockedDevStage).toBe("build");
    expect(store.getState().buildStatus).toBe("idle");
  });

  test("resets thinkStatus when going back to think", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", maxUnlockedDevStage: "plan", thinkStatus: "approved" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("think");
    expect(store.getState().maxUnlockedDevStage).toBe("think");
    expect(store.getState().thinkStatus).toBe("idle");
  });

  test("does nothing at think stage (no underflow)", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "think", maxUnlockedDevStage: "think" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("think");
    expect(store.getState().maxUnlockedDevStage).toBe("think");
  });

  test("does not reset unrelated statuses", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "build",
      maxUnlockedDevStage: "build",
      planStatus: "approved",
      thinkStatus: "approved",
      buildStatus: "done",
    });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("plan");
    expect(store.getState().maxUnlockedDevStage).toBe("plan");
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
    store.setState({ devStage: "test", maxUnlockedDevStage: "test", evalStatus: "idle" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("ship");
    expect(store.getState().maxUnlockedDevStage).toBe("ship");
    expect(store.getState().evalStatus).toBe("done");
  });

  test("sets evalStatus to done when running tests are skipped", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "test", maxUnlockedDevStage: "test", evalStatus: "running" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("ship");
    expect(store.getState().maxUnlockedDevStage).toBe("ship");
    expect(store.getState().evalStatus).toBe("done");
  });

  test("does not touch evalStatus when advancing from plan to build", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", maxUnlockedDevStage: "plan", evalStatus: "idle" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("build");
    expect(store.getState().maxUnlockedDevStage).toBe("build");
    expect(store.getState().evalStatus).toBe("idle");
  });

  test("does nothing at reflect stage (no overflow)", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "reflect", maxUnlockedDevStage: "reflect" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("reflect");
    expect(store.getState().maxUnlockedDevStage).toBe("reflect");
  });

  test("setDevStage preserves the furthest unlocked stage when inspecting earlier phases", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "review", maxUnlockedDevStage: "review" });

    store.getState().setDevStage("build");

    expect(store.getState().devStage).toBe("build");
    expect(store.getState().maxUnlockedDevStage).toBe("review");
  });

  test("setDevStage expands the furthest unlocked stage when moving forward", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", maxUnlockedDevStage: "review" });

    store.getState().setDevStage("test");

    expect(store.getState().devStage).toBe("test");
    expect(store.getState().maxUnlockedDevStage).toBe("test");
  });

  test("restored review progress survives stepper inspection of earlier stages", () => {
    const store = useCoPilotStore;
    store.getState().hydrateFromSeed({
      devStage: "review",
      thinkStatus: "approved",
      planStatus: "approved",
      buildStatus: "done",
    });

    store.getState().setDevStage("build");
    store.getState().setDevStage("plan");
    store.getState().setDevStage("think");

    expect(store.getState().devStage).toBe("think");
    expect(store.getState().maxUnlockedDevStage).toBe("review");

    store.getState().setDevStage("review");

    expect(store.getState().devStage).toBe("review");
    expect(store.getState().maxUnlockedDevStage).toBe("review");
  });
});
