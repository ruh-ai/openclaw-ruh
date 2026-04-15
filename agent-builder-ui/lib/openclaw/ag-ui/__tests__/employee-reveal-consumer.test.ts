import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  consumeEmployeeReveal,
  dispatchCustomEvent,
  type ConsumerDeps,
} from "../event-consumer-map";
import { CustomEventName } from "../types";
import { tracer } from "../event-tracer";
import { createEmptyBrowserWorkspaceState } from "../../browser-workspace";

function createMockDeps(overrides?: Partial<ConsumerDeps>): ConsumerDeps {
  return {
    coPilotStore: {
      setDiscoveryDocuments: mock(() => {}),
      setRevealData: mock(() => {}),
      setRevealStatus: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      pushBuildActivity: mock(() => {}),
      setBuildProgress: mock(() => {}),
      pushThinkActivity: mock(() => {}),
      updateBuildManifestTask: mock(() => {}),
      setThinkStep: mock(() => {}),
      pushResearchFinding: mock(() => {}),
      setResearchBriefPath: mock(() => {}),
      setPrdPath: mock(() => {}),
      setTrdPath: mock(() => {}),
      setPlanStep: mock(() => {}),
      pushPlanActivity: mock(() => {}),
      updateArchitecturePlanSection: mock(() => {}),
      devStage: "reveal",
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

// ─── consumeEmployeeReveal ─────────────────────────────────────────────────

describe("consumeEmployeeReveal", () => {
  const validPayload = {
    name: "Google Ads Specialist",
    title: "Campaign Management & Optimization",
    opening: "I read your brief. Here's what I understand...",
    what_i_heard: [
      "Running Google Ads campaigns",
      "Spending too much time on bid management",
      "Need to focus on product and growth",
    ],
    what_i_will_own: [
      "Daily bid adjustments and budget allocation",
      "Weekly performance reports with recommendations",
      "Keyword research and negative keyword management",
    ],
    what_i_wont_do: [
      "Access your billing or payment settings",
      "Change campaign strategy without your approval",
    ],
    first_move: "Audit your current campaign structure and identify top 3 quick wins",
    clarifying_question: "Are you optimizing primarily for ROAS, new customer acquisition, or brand awareness?",
  };

  test("sets reveal data and status when valid payload received", () => {
    const deps = createMockDeps();
    consumeEmployeeReveal(validPayload, deps);

    expect(deps.coPilotStore!.setRevealData).toHaveBeenCalledWith(validPayload);
    expect(deps.coPilotStore!.setRevealStatus).toHaveBeenCalledWith("ready");
    expect(deps.coPilotStore!.setDevStage).toHaveBeenCalledWith("reveal");
  });

  test("drops when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeEmployeeReveal(validPayload, deps);
    // Should not throw — just silently drops
    const drops = tracer.getTraces().filter((t: { status: string }) => t.status === "dropped");
    expect(drops.length).toBeGreaterThan(0);
  });

  test("drops when required fields are missing", () => {
    const deps = createMockDeps();
    consumeEmployeeReveal({ title: "Something" }, deps);

    expect(deps.coPilotStore!.setRevealData).not.toHaveBeenCalled();
  });

  test("fills missing optional fields with defaults", () => {
    const deps = createMockDeps();
    const minimalPayload = {
      name: "Test Agent",
      what_i_heard: ["Point 1"],
    };
    consumeEmployeeReveal(minimalPayload, deps);

    expect(deps.coPilotStore!.setRevealData).toHaveBeenCalledWith({
      name: "Test Agent",
      title: "",
      opening: "",
      what_i_heard: ["Point 1"],
      what_i_will_own: [],
      what_i_wont_do: [],
      first_move: "",
      clarifying_question: "",
    });
  });

  test("dispatches via event map with correct event name", () => {
    const deps = createMockDeps();
    dispatchCustomEvent(CustomEventName.EMPLOYEE_REVEAL, validPayload, deps);

    expect(deps.coPilotStore!.setRevealData).toHaveBeenCalled();
    expect(deps.coPilotStore!.setRevealStatus).toHaveBeenCalledWith("ready");
  });
});
