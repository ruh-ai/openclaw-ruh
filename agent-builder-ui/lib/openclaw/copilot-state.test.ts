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

  test("preserves dispatched think/plan run IDs through same-agent hydration", () => {
    const store = useCoPilotStore;
    store.getState().reset();
    store.setState({
      name: "Google Ads Agent",
      description: "Drive campaign optimization",
      thinkRunId: "think-run-1",
      lastDispatchedThinkRunId: "think-run-1",
      planRunId: "plan-run-1",
      lastDispatchedPlanRunId: "plan-run-1",
    });

    store.getState().hydrateFromSeed({
      name: "Google Ads Agent",
      description: "Drive campaign optimization",
      thinkRunId: "think-run-1",
      planRunId: "plan-run-1",
    });

    expect(store.getState().lastDispatchedThinkRunId).toBe("think-run-1");
    expect(store.getState().lastDispatchedPlanRunId).toBe("plan-run-1");
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

  test("markThinkRunDispatched and markPlanRunDispatched track run IDs", () => {
    useCoPilotStore.getState().reset();
    useCoPilotStore.setState({
      thinkRunId: "think-keep",
      planRunId: "plan-keep",
      lastDispatchedThinkRunId: "think-123",
      lastDispatchedPlanRunId: "plan-456",
    });

    useCoPilotStore.getState().setUserTriggeredThink(true);
    useCoPilotStore.getState().setUserTriggeredPlan(true);

    expect(useCoPilotStore.getState().lastDispatchedThinkRunId).toBeNull();
    expect(useCoPilotStore.getState().lastDispatchedPlanRunId).toBeNull();

    useCoPilotStore.getState().markThinkRunDispatched("think-123");
    useCoPilotStore.getState().markPlanRunDispatched("plan-456");

    expect(useCoPilotStore.getState().lastDispatchedThinkRunId).toBe("think-123");
    expect(useCoPilotStore.getState().lastDispatchedPlanRunId).toBe("plan-456");

    useCoPilotStore.getState().markThinkRunDispatched(null);
    useCoPilotStore.getState().markPlanRunDispatched(null);

    expect(useCoPilotStore.getState().lastDispatchedThinkRunId).toBeNull();
    expect(useCoPilotStore.getState().lastDispatchedPlanRunId).toBeNull();
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
    store.setState({ devStage: "plan", maxUnlockedDevStage: "plan", evalStatus: "idle", planStatus: "approved" });
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

  test("blocks advance from plan when planStatus is not approved/done", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", maxUnlockedDevStage: "plan", planStatus: "ready" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("plan");
  });

  test("blocks advance from think when thinkStatus is not approved/done", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "think", maxUnlockedDevStage: "think", thinkStatus: "generating" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("think");
  });

  test("blocks advance from build when buildStatus is not done", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", maxUnlockedDevStage: "build", buildStatus: "building" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("build");
  });

  test("canAdvanceDevStage returns false when stage gate not satisfied", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "plan", planStatus: "ready" });
    expect(store.getState().canAdvanceDevStage()).toBe(false);
    store.setState({ planStatus: "approved" });
    expect(store.getState().canAdvanceDevStage()).toBe(true);
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

describe("copilot-state wizard phase actions", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("advancePhase moves to next phase", () => {
    useCoPilotStore.setState({ phase: "purpose" });
    useCoPilotStore.getState().advancePhase();
    expect(useCoPilotStore.getState().phase).toBe("discovery");
  });

  test("advancePhase does nothing at last phase", () => {
    useCoPilotStore.setState({ phase: "review" });
    useCoPilotStore.getState().advancePhase();
    expect(useCoPilotStore.getState().phase).toBe("review");
  });

  test("goBackPhase moves to previous phase", () => {
    useCoPilotStore.setState({ phase: "skills" });
    useCoPilotStore.getState().goBackPhase();
    expect(useCoPilotStore.getState().phase).toBe("discovery");
  });

  test("goBackPhase does nothing at first phase", () => {
    useCoPilotStore.setState({ phase: "purpose" });
    useCoPilotStore.getState().goBackPhase();
    expect(useCoPilotStore.getState().phase).toBe("purpose");
  });

  test("setDiscoveryQuestions sets questions and status to ready", () => {
    const questions = [{ id: "q1", question: "What is your use case?" }] as any;
    useCoPilotStore.getState().setDiscoveryQuestions(questions);
    expect(useCoPilotStore.getState().discoveryQuestions).toEqual(questions);
    expect(useCoPilotStore.getState().discoveryStatus).toBe("ready");
  });

  test("setDiscoveryAnswer sets answer for a question", () => {
    useCoPilotStore.getState().setDiscoveryAnswer("q1", "Google Ads campaigns");
    expect(useCoPilotStore.getState().discoveryAnswers).toEqual({ q1: "Google Ads campaigns" });
  });

  test("setDiscoveryDocuments sets documents and status to ready", () => {
    const docs = {
      prd: { id: "prd1", title: "PRD", sections: [] } as any,
      trd: { id: "trd1", title: "TRD", sections: [] } as any,
    };
    useCoPilotStore.getState().setDiscoveryDocuments(docs);
    expect(useCoPilotStore.getState().discoveryDocuments).toEqual(docs);
    expect(useCoPilotStore.getState().discoveryStatus).toBe("ready");
  });

  test("skipDiscovery sets discoveryStatus to skipped and clears questions", () => {
    useCoPilotStore.setState({ discoveryQuestions: [{ id: "q1" }] as any });
    useCoPilotStore.getState().skipDiscovery();
    expect(useCoPilotStore.getState().discoveryStatus).toBe("skipped");
    expect(useCoPilotStore.getState().discoveryQuestions).toBeNull();
    expect(useCoPilotStore.getState().discoveryAnswers).toEqual({});
  });

  test("updateDiscoveryDocSection updates a section content", () => {
    const docs = {
      prd: { id: "prd1", title: "PRD", sections: [{ heading: "Overview", content: "Original" }] } as any,
      trd: { id: "trd1", title: "TRD", sections: [] } as any,
    };
    useCoPilotStore.getState().setDiscoveryDocuments(docs);
    useCoPilotStore.getState().updateDiscoveryDocSection("prd", 0, "Updated content");
    expect(useCoPilotStore.getState().discoveryDocuments!.prd.sections[0].content).toBe("Updated content");
  });

  test("updateDiscoveryDocSection does nothing when no discoveryDocuments", () => {
    useCoPilotStore.setState({ discoveryDocuments: null });
    useCoPilotStore.getState().updateDiscoveryDocSection("prd", 0, "Updated");
    expect(useCoPilotStore.getState().discoveryDocuments).toBeNull();
  });
});
