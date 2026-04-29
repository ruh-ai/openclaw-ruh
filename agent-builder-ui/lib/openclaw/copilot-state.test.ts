import { describe, expect, test, beforeEach } from "bun:test";

import { AGENT_DEV_STAGES, PHASE_ORDER, useCoPilotStore } from "./copilot-state";

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

  test("tracks selected artifact target and chat mode", () => {
    const store = useCoPilotStore.getState();
    store.reset();

    store.setSelectedArtifactTarget({ kind: "plan", path: ".openclaw/plan/architecture.json" });
    store.setChatMode("revise");

    expect(useCoPilotStore.getState().selectedArtifactTarget).toEqual({
      kind: "plan",
      path: ".openclaw/plan/architecture.json",
    });
    expect(useCoPilotStore.getState().chatMode).toBe("revise");
  });
});

// ── Batch 1 UX fixes ────────────────────────────────────────────────────────

describe("goBackDevStage", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("resets planStatus to idle when going back to plan", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "prototype", maxUnlockedDevStage: "prototype", planStatus: "approved" });
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

  test("goes back from think to reveal", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "think", maxUnlockedDevStage: "think" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("reveal");
    expect(store.getState().maxUnlockedDevStage).toBe("reveal");
  });

  test("does nothing at reveal stage (no underflow)", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "reveal", maxUnlockedDevStage: "reveal" });
    store.getState().goBackDevStage();
    expect(store.getState().devStage).toBe("reveal");
    expect(store.getState().maxUnlockedDevStage).toBe("reveal");
  });

  test("does not reset unrelated statuses", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "prototype",
      maxUnlockedDevStage: "prototype",
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

  test("places prototype between plan and build in the lifecycle", () => {
    expect(AGENT_DEV_STAGES).toEqual([
      "reveal",
      "think",
      "plan",
      "prototype",
      "build",
      "review",
      "test",
      "ship",
      "reflect",
    ]);
  });

  test("blocks advance from test when there is no passing eval report", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "test", maxUnlockedDevStage: "test", evalStatus: "idle" });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("test");
    expect(store.getState().maxUnlockedDevStage).toBe("test");
    expect(store.getState().evalStatus).toBe("idle");
  });

  test("blocks advance from test when eval results require manual review", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "test",
      maxUnlockedDevStage: "test",
      evalStatus: "done",
      evalTasks: [
        { id: "manual", title: "Manual", input: "input", expectedBehavior: "expected", status: "manual", confidence: 0.3 },
      ],
    });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("test");
  });

  test("advances from test only after all eval tasks pass", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "test",
      maxUnlockedDevStage: "test",
      evalStatus: "done",
      evalTasks: [
        { id: "pass", title: "Pass", input: "input", expectedBehavior: "expected", status: "pass", confidence: 0.9 },
      ],
    });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("ship");
    expect(store.getState().maxUnlockedDevStage).toBe("ship");
  });

  test("does not touch evalStatus when advancing from plan to prototype", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "plan",
      maxUnlockedDevStage: "plan",
      evalStatus: "idle",
      planStatus: "approved",
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [],
      },
    });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("prototype");
    expect(store.getState().maxUnlockedDevStage).toBe("prototype");
    expect(store.getState().evalStatus).toBe("idle");
  });

  test("waits for backend confirmation before changing stages", async () => {
    const store = useCoPilotStore;
    let confirm!: (value: { stage: "review" }) => void;
    const confirmed = new Promise<{ stage: "review" }>((resolve) => {
      confirm = resolve;
    });
    store.setState({ devStage: "build", maxUnlockedDevStage: "build", buildStatus: "done" });

    const advance = store.getState().advanceDevStage({
      confirmStage: async (nextStage) => {
        expect(nextStage).toBe("review");
        return confirmed;
      },
    });

    expect(store.getState().devStage).toBe("build");
    expect(store.getState().lifecycleAdvanceStatus).toBe("saving");

    confirm({ stage: "review" });
    await advance;

    expect(store.getState().devStage).toBe("review");
    expect(store.getState().maxUnlockedDevStage).toBe("review");
    expect(store.getState().lifecycleAdvanceStatus).toBe("idle");
    expect(store.getState().lifecycleAdvanceError).toBeNull();
  });

  test("keeps the current stage when backend confirmation rejects", async () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "build", maxUnlockedDevStage: "build", buildStatus: "done" });

    const advanced = await store.getState().advanceDevStage({
      confirmStage: async () => {
        throw new Error("Build report is blocked.");
      },
    });

    expect(advanced).toBe(false);
    expect(store.getState().devStage).toBe("build");
    expect(store.getState().maxUnlockedDevStage).toBe("build");
    expect(store.getState().lifecycleAdvanceStatus).toBe("failed");
    expect(store.getState().lifecycleAdvanceError).toBe("Build report is blocked.");
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

  test("blocks advance from think when PRD/TRD documents are missing", () => {
    const store = useCoPilotStore;
    store.setState({ devStage: "think", maxUnlockedDevStage: "think", thinkStatus: "approved", discoveryDocuments: null });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("think");
    expect(store.getState().canAdvanceDevStage()).toBe(false);
  });

  test("advances from think after approval and PRD/TRD documents exist", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "think",
      maxUnlockedDevStage: "think",
      thinkStatus: "approved",
      discoveryDocuments: {
        prd: { title: "PRD", sections: [{ heading: "Goal", content: "Define the product." }] },
        trd: { title: "TRD", sections: [{ heading: "System", content: "Define the system." }] },
      },
    });
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("plan");
    expect(store.getState().maxUnlockedDevStage).toBe("plan");
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
    expect(store.getState().canAdvanceDevStage()).toBe(false);
    store.setState({
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [],
      },
    });
    expect(store.getState().canAdvanceDevStage()).toBe(true);
  });

  test("blocks advance from plan when the architecture plan is empty", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "plan",
      maxUnlockedDevStage: "plan",
      planStatus: "approved",
      architecturePlan: {
        skills: [],
        workflow: { steps: [] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [],
      },
    });

    expect(store.getState().canAdvanceDevStage()).toBe(false);
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("plan");
  });

  test("blocks advance from plan when dashboard pages lack an approved prototype spec", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "plan",
      maxUnlockedDevStage: "plan",
      planStatus: "approved",
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [
          { path: "/projects", title: "Projects", components: [] },
        ],
      },
    });

    expect(store.getState().canAdvanceDevStage()).toBe(false);
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("plan");
  });

  test("allows plan advance to prototype for dashboard agents after dashboardPrototype is present", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "plan",
      maxUnlockedDevStage: "plan",
      planStatus: "approved",
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [
          { path: "/projects", title: "Projects", components: [] },
        ],
        dashboardPrototype: {
          summary: "Project workspace",
          primaryUsers: ["Estimator"],
          workflows: [
            {
              id: "review-project",
              name: "Review Project",
              steps: ["Open project", "Resolve blockers"],
              requiredActions: ["resolve_blocker"],
              successCriteria: ["Cannot approve with blockers"],
            },
          ],
          pages: [
            {
              path: "/projects",
              title: "Projects",
              purpose: "Select active estimate",
              supportsWorkflows: ["review-project"],
              requiredActions: ["open_project"],
              acceptanceCriteria: ["Shows blocker count"],
            },
          ],
          revisionPrompts: ["Does this match the estimating workflow?"],
          approvalChecklist: ["Prototype reviewed with user"],
        },
      },
    });

    expect(store.getState().canAdvanceDevStage()).toBe(true);
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("prototype");
  });

  test("blocks prototype advance when dashboard pages lack an approved prototype spec", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "prototype",
      maxUnlockedDevStage: "prototype",
      planStatus: "approved",
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [
          { path: "/projects", title: "Projects", components: [] },
        ],
      },
    });

    expect(store.getState().canAdvanceDevStage()).toBe(false);
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("prototype");
  });

  test("allows prototype advance to build when dashboardPrototype is present", () => {
    const store = useCoPilotStore;
    store.setState({
      devStage: "prototype",
      maxUnlockedDevStage: "prototype",
      planStatus: "approved",
      architecturePlan: {
        skills: [{ id: "review-project", name: "Review Project", description: "Review estimate projects.", dependencies: [], envVars: [] }],
        workflow: { steps: [{ skillId: "review-project" }] },
        integrations: [],
        triggers: [],
        channels: [],
        envVars: [],
        subAgents: [],
        missionControl: null,
        dataSchema: null,
        apiEndpoints: [],
        dashboardPages: [
          { path: "/projects", title: "Projects", components: [] },
        ],
        dashboardPrototype: {
          summary: "Project workspace",
          primaryUsers: ["Estimator"],
          workflows: [
            {
              id: "review-project",
              name: "Review Project",
              steps: ["Open project", "Resolve blockers"],
              requiredActions: ["resolve_blocker"],
              successCriteria: ["Cannot approve with blockers"],
            },
          ],
          pages: [
            {
              path: "/projects",
              title: "Projects",
              purpose: "Select active estimate",
              supportsWorkflows: ["review-project"],
              requiredActions: ["open_project"],
              acceptanceCriteria: ["Shows blocker count"],
            },
          ],
          revisionPrompts: ["Does this match the estimating workflow?"],
          approvalChecklist: ["Prototype reviewed with user"],
        },
      },
    });

    expect(store.getState().canAdvanceDevStage()).toBe(true);
    store.getState().advanceDevStage();
    expect(store.getState().devStage).toBe("build");
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
