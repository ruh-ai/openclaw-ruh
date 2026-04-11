import { describe, expect, test, beforeEach, mock } from "bun:test";

mock.module("@/lib/openclaw/plan-formatter", () => ({
  normalizePlan: (plan: Record<string, unknown>) => plan ?? {},
}));

import {
  dispatchCustomEvent,
  consumeBrowserEvent,
  consumeSkillGraphReady,
  consumeEditorFileChanged,
  consumePreviewServerDetected,
  consumeReasoning,
  consumeThinkStatus,
  consumeThinkActivity,
  consumeDiscoveryDocuments,
  consumeArchitecturePlanReady,
  consumeWizardEvent,
  consumeWizardPhase,
  type ConsumerDeps,
} from "./event-consumer-map";
import { CustomEventName } from "./types";
import { tracer } from "./event-tracer";
import { createEmptyBrowserWorkspaceState } from "../browser-workspace";

function createMockDeps(overrides: Partial<ConsumerDeps> = {}): ConsumerDeps {
  const browserState = createEmptyBrowserWorkspaceState();
  return {
    coPilotStore: null,
    commitBuilderMetadata: mock(() => {}),
    setMessages: mock(() => {}),
    setLiveResponse: mock(() => {}),
    setLiveBrowserState: mock(() => {}),
    liveBrowserStateRef: { current: browserState },
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

describe("dispatchCustomEvent", () => {
  beforeEach(() => {
    tracer.clear();
  });

  test("returns true for known simple consumer events", () => {
    const deps = createMockDeps();
    expect(dispatchCustomEvent(CustomEventName.BROWSER_EVENT, { type: "navigation", url: "http://test.com", label: "test" }, deps)).toBe(true);
  });

  test("returns true for wizard events", () => {
    const deps = createMockDeps();
    expect(dispatchCustomEvent(CustomEventName.WIZARD_UPDATE_FIELDS, { name: "Test" }, deps)).toBe(true);
    expect(deps.commitBuilderMetadata).toHaveBeenCalled();
  });

  test("returns false for unknown events", () => {
    const deps = createMockDeps();
    expect(dispatchCustomEvent("totally_unknown_event", {}, deps)).toBe(false);
  });

  test("catches consumer errors and still returns true", () => {
    const deps = createMockDeps({
      setLiveBrowserState: () => { throw new Error("boom"); },
    });
    const result = dispatchCustomEvent(CustomEventName.BROWSER_EVENT, { type: "navigation", url: "http://test.com", label: "t" }, deps);
    expect(result).toBe(true);
  });
});

describe("consumeEditorFileChanged", () => {
  test("calls fetchEditorFile and increments workspace tick", () => {
    const deps = createMockDeps();
    consumeEditorFileChanged({ path: "/root/test.ts" }, deps);
    expect(deps.fetchEditorFile).toHaveBeenCalledWith("/root/test.ts");
    expect(deps.setWorkspaceFilesTick).toHaveBeenCalled();
  });

  test("does not call fetchEditorFile if path is missing", () => {
    const deps = createMockDeps();
    consumeEditorFileChanged({}, deps);
    expect(deps.fetchEditorFile).not.toHaveBeenCalled();
  });
});

describe("consumePreviewServerDetected", () => {
  test("adds port to detected preview ports", () => {
    const deps = createMockDeps();
    consumePreviewServerDetected({ port: 3000 }, deps);
    expect(deps.setDetectedPreviewPorts).toHaveBeenCalled();
  });
});

describe("consumeReasoning", () => {
  test("calls ensureReasoningStep and appendReasoningStepDetail", () => {
    const deps = createMockDeps();
    consumeReasoning({ content: "thinking about it..." }, deps);
    expect(deps.pushStep).toHaveBeenCalled();
    expect(deps.updateStepDetail).toHaveBeenCalled();
  });
});

describe("consumeThinkStatus", () => {
  test("drops event and adds warning if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeThinkStatus({ status: "active" }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });
});

describe("consumeDiscoveryDocuments", () => {
  test("drops if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeDiscoveryDocuments({ prd: {}, trd: {} }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });
});

describe("consumeArchitecturePlanReady", () => {
  test("drops if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeArchitecturePlanReady({ plan: {} }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });
});

describe("consumeWizardEvent", () => {
  test("calls commitBuilderMetadata with event name and value", () => {
    const deps = createMockDeps();
    consumeWizardEvent({ name: "Test Agent" }, deps, CustomEventName.WIZARD_UPDATE_FIELDS);
    expect(deps.commitBuilderMetadata).toHaveBeenCalledWith(
      CustomEventName.WIZARD_UPDATE_FIELDS,
      { name: "Test Agent" },
    );
  });
});

describe("consumeWizardPhase", () => {
  test("drops if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeWizardPhase({ phase: "skills" }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });

  test("calls setPhase when coPilotStore is provided", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeWizardPhase({ phase: "tools" }, deps);
    expect(mockStore.setPhase).toHaveBeenCalledWith("tools");
  });
});

function createMockCoPilotStore(overrides: Partial<{
  devStage: string;
  architecturePlan: unknown;
  researchBriefPath: string | null;
  prdPath: string | null;
  trdPath: string | null;
  thinkStatus: string;
}> = {}) {
  return {
    setDiscoveryDocuments: mock(() => {}),
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
    devStage: overrides.devStage ?? "think",
    architecturePlan: overrides.architecturePlan ?? null,
    researchBriefPath: overrides.researchBriefPath ?? null,
    prdPath: overrides.prdPath ?? null,
    trdPath: overrides.trdPath ?? null,
    thinkStatus: overrides.thinkStatus ?? "pending",
  };
}

describe("consumeBrowserEvent", () => {
  test("updates live browser state", () => {
    const deps = createMockDeps();
    consumeBrowserEvent(
      { type: "navigation", url: "http://example.com", label: "test" },
      deps,
    );
    expect(deps.setLiveBrowserState).toHaveBeenCalled();
  });
});

describe("consumeSkillGraphReady", () => {
  test("adds message and clears live response without copilot store", () => {
    const deps = createMockDeps();
    consumeSkillGraphReady(
      { content: "Done!", skillGraph: [{ id: "s1" }] },
      deps,
    );
    expect(deps.setMessages).toHaveBeenCalled();
    expect(deps.setLiveResponse).toHaveBeenCalledWith("");
    expect(deps.readyForReviewFiredRef.current).toBe(true);
    expect(deps.onReadyForReview).toHaveBeenCalled();
  });

  test("advances to review when coPilotStore devStage is build", () => {
    const mockStore = createMockCoPilotStore({ devStage: "build" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeSkillGraphReady({ content: "Done!", skillGraph: [] }, deps);
    expect(mockStore.setBuildStatus).toHaveBeenCalledWith("done");
    expect(mockStore.setDevStage).toHaveBeenCalledWith("review");
  });

  test("does not advance devStage when not in build stage", () => {
    const mockStore = createMockCoPilotStore({ devStage: "review" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeSkillGraphReady({ content: "Done!", skillGraph: [] }, deps);
    expect(mockStore.setBuildStatus).not.toHaveBeenCalled();
  });
});

describe("consumeThinkStatus with coPilotStore", () => {
  test("sets think status and devStage when store provided and stage is think", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeThinkStatus({ status: "active" }, deps);
    expect(mockStore.setThinkStatus).toHaveBeenCalledWith("active");
    expect(mockStore.setDevStage).toHaveBeenCalledWith("think");
  });

  test("ignores think_status when stage has advanced past think", () => {
    const mockStore = createMockCoPilotStore({ devStage: "plan" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeThinkStatus({ status: "active" }, deps);
    expect(mockStore.setThinkStatus).not.toHaveBeenCalled();
  });

  test("sets devStage to think when no current stage", () => {
    const mockStore = createMockCoPilotStore({ devStage: "" as any });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeThinkStatus({ status: "active" }, deps);
    expect(mockStore.setThinkStatus).toHaveBeenCalledWith("active");
    expect(mockStore.setDevStage).toHaveBeenCalledWith("think");
  });
});

describe("consumeThinkActivity", () => {
  test("drops if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeThinkActivity({ type: "status", label: "Working" }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });

  test("pushes think activity when store provided and stage is think", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeThinkActivity({ type: "research", label: "Researching Google Ads" }, deps);
    expect(mockStore.pushThinkActivity).toHaveBeenCalledWith({
      type: "research",
      label: "Researching Google Ads",
    });
  });

  test("ignores think_activity when stage has advanced past think", () => {
    const mockStore = createMockCoPilotStore({ devStage: "build" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeThinkActivity({ type: "status", label: "Working" }, deps);
    expect(mockStore.pushThinkActivity).not.toHaveBeenCalled();
  });
});

describe("consumeDiscoveryDocuments with coPilotStore", () => {
  test("sets discovery documents when prd and trd exist", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeDiscoveryDocuments({ prd: { id: "prd1" }, trd: { id: "trd1" } }, deps);
    expect(mockStore.setDiscoveryDocuments).toHaveBeenCalled();
    expect(mockStore.setThinkStatus).toHaveBeenCalledWith("ready");
  });

  test("drops if prd or trd is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeDiscoveryDocuments({ prd: { id: "prd1" } }, deps);
    expect(mockStore.setDiscoveryDocuments).not.toHaveBeenCalled();
  });

  test("does not revert devStage to think if stage advanced past it", () => {
    const mockStore = createMockCoPilotStore({ devStage: "plan" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeDiscoveryDocuments({ prd: { id: "prd1" }, trd: { id: "trd1" } }, deps);
    expect(mockStore.setDevStage).not.toHaveBeenCalled();
  });
});

describe("consumeArchitecturePlanReady with coPilotStore", () => {
  test("sets plan and advances to plan stage", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeArchitecturePlanReady({ plan: { skills: [], workflow: null } }, deps);
    expect(mockStore.setArchitecturePlan).toHaveBeenCalled();
    expect(mockStore.setPlanStatus).toHaveBeenCalledWith("ready");
    expect(mockStore.setDevStage).toHaveBeenCalledWith("plan");
  });

  test("drops if plan is missing in payload", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    consumeArchitecturePlanReady({ systemName: "Ruh" }, deps);
    expect(mockStore.setArchitecturePlan).not.toHaveBeenCalled();
  });
});

describe("dispatchCustomEvent — build/workspace events", () => {
  test("handles file_written event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    const result = dispatchCustomEvent(
      CustomEventName.FILE_WRITTEN,
      { path: "skills/campaign.md", tool: "write_file" },
      deps,
    );
    expect(result).toBe(true);
    expect(deps.setWorkspaceFilesTick).toHaveBeenCalled();
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "file" }),
    );
  });

  test("handles skill_created event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    const result = dispatchCustomEvent(
      CustomEventName.SKILL_CREATED,
      { skillId: "campaign-monitor", path: "skills/campaign-monitor.md" },
      deps,
    );
    expect(result).toBe(true);
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "skill", label: "campaign monitor" }),
    );
  });

  test("handles build_progress event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.BUILD_PROGRESS,
      { completed: 3, total: 10, currentSkill: "campaign-monitor" },
      deps,
    );
    expect(mockStore.setBuildProgress).toHaveBeenCalledWith({
      completed: 3,
      total: 10,
      currentSkill: "campaign-monitor",
    });
  });

  test("handles workspace_changed event", () => {
    const deps = createMockDeps();
    dispatchCustomEvent(
      CustomEventName.WORKSPACE_CHANGED,
      { action: "create", path: "skills/new.md" },
      deps,
    );
    expect(deps.setWorkspaceFilesTick).toHaveBeenCalled();
  });

  test("handles build_task_updated event with taskId", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.BUILD_TASK_UPDATED,
      { taskId: "t1", specialist: "builder", status: "done", files: ["skills/a.md"] },
      deps,
    );
    expect(mockStore.updateBuildManifestTask).toHaveBeenCalledWith("t1", {
      status: "done",
      files: ["skills/a.md"],
      error: undefined,
    });
  });

  test("skips build_task_updated when taskId is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.BUILD_TASK_UPDATED, {}, deps);
    expect(mockStore.updateBuildManifestTask).not.toHaveBeenCalled();
  });
});

describe("dispatchCustomEvent — think v4 events", () => {
  test("handles think_step event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.THINK_STEP,
      { step: "research", status: "started" },
      deps,
    );
    expect(mockStore.setThinkStep).toHaveBeenCalledWith("research");
    expect(mockStore.pushThinkActivity).toHaveBeenCalled();
  });

  test("skips think_step when step is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.THINK_STEP, {}, deps);
    expect(mockStore.setThinkStep).not.toHaveBeenCalled();
  });

  test("handles think_research_finding event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.THINK_RESEARCH_FINDING,
      { title: "Google Ads API v14", summary: "New API version released", source: "https://dev.google.com" },
      deps,
    );
    expect(mockStore.pushResearchFinding).toHaveBeenCalledWith({
      title: "Google Ads API v14",
      summary: "New API version released",
      source: "https://dev.google.com",
    });
  });

  test("skips think_research_finding when title or summary missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.THINK_RESEARCH_FINDING, { title: "Only title" }, deps);
    expect(mockStore.pushResearchFinding).not.toHaveBeenCalled();
  });

  test("handles think_document_ready for research_brief", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "research_brief", path: "/workspace/research_brief.md" },
      deps,
    );
    expect(mockStore.setResearchBriefPath).toHaveBeenCalledWith("/workspace/research_brief.md");
  });

  test("handles think_document_ready for prd", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "prd", path: "/workspace/PRD.md" },
      deps,
    );
    expect(mockStore.setPrdPath).toHaveBeenCalledWith("/workspace/PRD.md");
  });

  test("handles think_document_ready for trd", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "trd", path: "/workspace/TRD.md" },
      deps,
    );
    expect(mockStore.setTrdPath).toHaveBeenCalledWith("/workspace/TRD.md");
  });

  test("skips think_document_ready when docType or path missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.THINK_DOCUMENT_READY, { docType: "prd" }, deps);
    expect(mockStore.setPrdPath).not.toHaveBeenCalled();
  });
});

describe("dispatchCustomEvent — plan v4 events", () => {
  test("handles plan_skills event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.PLAN_SKILLS,
      { skills: [{ id: "s1" }, { id: "s2" }] },
      deps,
    );
    expect(mockStore.updateArchitecturePlanSection).toHaveBeenCalledWith(
      "skills",
      [{ id: "s1" }, { id: "s2" }],
    );
    expect(mockStore.setPlanStep).toHaveBeenCalledWith("skills");
  });

  test("handles plan_workflow event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.PLAN_WORKFLOW,
      { workflow: { steps: [{ skillId: "s1" }] } },
      deps,
    );
    expect(mockStore.updateArchitecturePlanSection).toHaveBeenCalledWith(
      "workflow",
      { steps: [{ skillId: "s1" }] },
    );
  });

  test("handles plan_complete event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.PLAN_COMPLETE, {}, deps);
    expect(mockStore.setPlanStep).toHaveBeenCalledWith("complete");
    expect(mockStore.setPlanStatus).toHaveBeenCalledWith("ready");
  });

  test("plan_complete synthesizes minimal plan when architecturePlan is null", () => {
    const mockStore = createMockCoPilotStore({ architecturePlan: null });
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.PLAN_COMPLETE, {}, deps);
    expect(mockStore.setArchitecturePlan).toHaveBeenCalled();
  });

  test("plan_complete does not overwrite existing architecturePlan", () => {
    const mockStore = createMockCoPilotStore({ architecturePlan: { skills: [] } });
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(CustomEventName.PLAN_COMPLETE, {}, deps);
    expect(mockStore.setArchitecturePlan).not.toHaveBeenCalled();
  });

  test("handles plan_env_vars event", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });
    dispatchCustomEvent(
      CustomEventName.PLAN_ENV_VARS,
      { envVars: [{ key: "GOOGLE_ADS_TOKEN", label: "Google Ads Token", description: "...", required: true }] },
      deps,
    );
    expect(mockStore.updateArchitecturePlanSection).toHaveBeenCalledWith(
      "envVars",
      expect.any(Array),
    );
  });
});

describe("dispatchCustomEvent — wizard events", () => {
  test("handles WIZARD_SET_SKILLS event", () => {
    const deps = createMockDeps();
    const result = dispatchCustomEvent(
      CustomEventName.WIZARD_SET_SKILLS,
      [{ id: "s1", name: "Campaign Monitor" }],
      deps,
    );
    expect(result).toBe(true);
    expect(deps.commitBuilderMetadata).toHaveBeenCalledWith(
      CustomEventName.WIZARD_SET_SKILLS,
      expect.any(Array),
    );
  });

  test("handles WIZARD_CONNECT_TOOLS event", () => {
    const deps = createMockDeps();
    dispatchCustomEvent(CustomEventName.WIZARD_CONNECT_TOOLS, [{ toolId: "google-ads" }], deps);
    expect(deps.commitBuilderMetadata).toHaveBeenCalled();
  });
});
