import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  dispatchCustomEvent,
  consumeDiscoveryDocuments,
  consumeArchitecturePlanReady,
  consumeThinkStatus,
  consumeSkillGraphReady,
  consumeWizardEvent,
  consumeWizardPhase,
  type ConsumerDeps,
} from "../event-consumer-map";
import { CustomEventName } from "../types";
import { tracer } from "../event-tracer";
import { createEmptyBrowserWorkspaceState } from "../../browser-workspace";

function createMockDeps(overrides?: Partial<ConsumerDeps>): ConsumerDeps {
  return {
    coPilotStore: {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      devStage: "think",
    },
    commitBuilderMetadata: mock(() => {}),
    setMessages: mock(() => {}),
    setLiveResponse: mock(() => {}),
    setLiveBrowserState: mock(() => {}),
    liveBrowserStateRef: { current: createEmptyBrowserWorkspaceState() },
    setWorkspaceFilesTick: mock(() => {}),
    setDetectedPreviewPorts: mock(() => {}),
    fetchEditorFile: mock(() => {}),
    onReadyForReview: mock(() => {}),
    pushStep: mock(() => {}),
    updateStepDetail: mock(() => {}),
    thinkStepIdRef: { current: -1 },
    readyForReviewFiredRef: { current: false },
    ...overrides,
  };
}

beforeEach(() => {
  tracer.clear();
});

// ─── consumeDiscoveryDocuments ──────────────────────────────────────────────

describe("consumeDiscoveryDocuments", () => {
  test("calls setDiscoveryDocuments + setThinkStatus when prd+trd present", () => {
    const deps = createMockDeps();
    const payload = {
      prd: { title: "PRD", sections: [{ heading: "H", content: "C" }] },
      trd: { title: "TRD", sections: [{ heading: "H", content: "C" }] },
    };

    consumeDiscoveryDocuments(payload, deps);

    expect(deps.coPilotStore!.setDiscoveryDocuments).toHaveBeenCalledWith({
      prd: payload.prd,
      trd: payload.trd,
    });
    expect(deps.coPilotStore!.setThinkStatus).toHaveBeenCalledWith("ready");
    expect(deps.coPilotStore!.setDevStage).toHaveBeenCalledWith("think");
  });

  test("drops when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });

    consumeDiscoveryDocuments({ prd: {}, trd: {} }, deps);

    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toContain("coPilotStore is null");
  });

  test("pushes warning message when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeDiscoveryDocuments({ prd: {}, trd: {} }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });

  test("drops when prd is missing", () => {
    const deps = createMockDeps();

    consumeDiscoveryDocuments({ trd: { title: "TRD" } }, deps);

    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toContain("prd or trd missing");
  });
});

// ─── consumeThinkStatus ─────────────────────────────────────────────────────

describe("consumeThinkStatus", () => {
  test("calls setThinkStatus and setDevStage", () => {
    const deps = createMockDeps();

    consumeThinkStatus({ status: "generating" }, deps);

    expect(deps.coPilotStore!.setThinkStatus).toHaveBeenCalledWith("generating");
    expect(deps.coPilotStore!.setDevStage).toHaveBeenCalledWith("think");
  });

  test("drops when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });

    consumeThinkStatus({ status: "generating" }, deps);

    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
  });

  test("pushes warning message when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeThinkStatus({ status: "generating" }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });
});

// ─── consumeSkillGraphReady ─────────────────────────────────────────────────

describe("consumeSkillGraphReady", () => {
  test("calls commitBuilderMetadata + adds message + fires onReadyForReview", () => {
    const deps = createMockDeps();

    consumeSkillGraphReady(
      { skillGraph: [{ skill_id: "s1" }], content: "Generated 1 skill." },
      deps,
    );

    expect(deps.commitBuilderMetadata).toHaveBeenCalledWith(
      CustomEventName.SKILL_GRAPH_READY,
      expect.anything(),
    );
    expect(deps.setMessages).toHaveBeenCalled();
    expect(deps.onReadyForReview).toHaveBeenCalled();
    expect(deps.readyForReviewFiredRef.current).toBe(true);
  });

  test("advances build stage to review when devStage is build", () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      devStage: "build" as const,
    };
    const deps = createMockDeps({ coPilotStore: store });

    consumeSkillGraphReady(
      { skillGraph: [{ skill_id: "s1" }], content: "Done." },
      deps,
    );

    expect(store.setBuildStatus).toHaveBeenCalledWith("done");
    expect(store.setDevStage).toHaveBeenCalledWith("review");
  });

  test("advances to review from think stage (architect one-shot response)", () => {
    const deps = createMockDeps(); // devStage defaults to "think"

    consumeSkillGraphReady(
      { skillGraph: [{ skill_id: "s1" }], content: "Done." },
      deps,
    );

    expect(deps.coPilotStore!.setBuildStatus).toHaveBeenCalledWith("done");
    expect(deps.coPilotStore!.setDevStage).toHaveBeenCalledWith("review");
  });

  test("does not advance when already past review", () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      devStage: "test" as const,
    };
    const deps = createMockDeps({ coPilotStore: store });

    consumeSkillGraphReady(
      { skillGraph: [{ skill_id: "s1" }], content: "Done." },
      deps,
    );

    expect(store.setBuildStatus).not.toHaveBeenCalled();
  });
});

// ─── consumeWizardEvent ─────────────────────────────────────────────────────

describe("consumeWizardEvent", () => {
  test("calls commitBuilderMetadata with event name", () => {
    const deps = createMockDeps();

    consumeWizardEvent({ name: "Test" }, deps, CustomEventName.WIZARD_UPDATE_FIELDS);

    expect(deps.commitBuilderMetadata).toHaveBeenCalledWith(
      CustomEventName.WIZARD_UPDATE_FIELDS,
      { name: "Test" },
    );
  });
});

// ─── consumeWizardPhase ─────────────────────────────────────────────────────

describe("consumeWizardPhase", () => {
  test("calls coPilotStore.setPhase", () => {
    const deps = createMockDeps();

    consumeWizardPhase({ phase: "skills" }, deps);

    expect(deps.coPilotStore!.setPhase).toHaveBeenCalledWith("skills");
  });
});

// ─── consumeArchitecturePlanReady ────────────────────────────────────────────

describe("consumeArchitecturePlanReady", () => {
  const fakePlan = {
    skills: [{ id: "s1", name: "S1", description: "D", dependencies: [], envVars: [] }],
    workflow: { steps: [] },
    integrations: [],
    triggers: [],
    channels: [],
    envVars: [],
    subAgents: [],
    missionControl: null,
  };

  test("calls setArchitecturePlan + setPlanStatus + setDevStage", () => {
    const deps = createMockDeps();

    consumeArchitecturePlanReady({ plan: fakePlan, systemName: "test", content: "Plan ready" }, deps);

    expect(deps.coPilotStore!.setArchitecturePlan).toHaveBeenCalledWith(fakePlan);
    expect(deps.coPilotStore!.setPlanStatus).toHaveBeenCalledWith("ready");
    expect(deps.coPilotStore!.setDevStage).toHaveBeenCalledWith("plan");
  });

  test("drops when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });

    consumeArchitecturePlanReady({ plan: fakePlan }, deps);

    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toContain("coPilotStore is null");
  });

  test("pushes warning message when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeArchitecturePlanReady({ plan: fakePlan }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });

  test("drops when plan is missing from payload", () => {
    const deps = createMockDeps();

    consumeArchitecturePlanReady({ systemName: "test" }, deps);

    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toContain("plan missing");
  });
});

// ─── dispatchCustomEvent (main dispatcher) ──────────────────────────────────

describe("dispatchCustomEvent", () => {
  test("dispatches known events to consumers", () => {
    const deps = createMockDeps();

    const handled = dispatchCustomEvent("discovery_documents", {
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    }, deps);

    expect(handled).toBe(true);
    expect(deps.coPilotStore!.setDiscoveryDocuments).toHaveBeenCalled();
  });

  test("dispatches architecture_plan_ready to consumer", () => {
    const deps = createMockDeps();

    const handled = dispatchCustomEvent("architecture_plan_ready", {
      plan: { skills: [], workflow: { steps: [] }, integrations: [], triggers: [], channels: [], envVars: [], subAgents: [], missionControl: null },
    }, deps);

    expect(handled).toBe(true);
    expect(deps.coPilotStore!.setArchitecturePlan).toHaveBeenCalled();
    expect(deps.coPilotStore!.setPlanStatus).toHaveBeenCalledWith("ready");
  });

  test("dispatches wizard events via commitBuilderMetadata", () => {
    const deps = createMockDeps();

    const handled = dispatchCustomEvent(
      CustomEventName.WIZARD_SET_SKILLS,
      { nodes: [], skillIds: [] },
      deps,
    );

    expect(handled).toBe(true);
    expect(deps.commitBuilderMetadata).toHaveBeenCalledWith(
      CustomEventName.WIZARD_SET_SKILLS,
      { nodes: [], skillIds: [] },
    );
  });

  test("returns false and traces drop for unknown events", () => {
    const deps = createMockDeps();

    const handled = dispatchCustomEvent("unknown_event_xyz", {}, deps);

    expect(handled).toBe(false);
    const drops = tracer.getTraces().filter((t) => t.status === "dropped");
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toContain("no consumer registered");
  });

  test("traces all events through the pipeline", () => {
    const deps = createMockDeps();

    dispatchCustomEvent("think_status", { status: "generating" }, deps);

    const traces = tracer.getTraces();
    const received = traces.filter((t) => t.status === "received");
    const applied = traces.filter((t) => t.status === "applied");
    expect(received.length).toBeGreaterThan(0);
    expect(applied.length).toBeGreaterThan(0);
  });
});
