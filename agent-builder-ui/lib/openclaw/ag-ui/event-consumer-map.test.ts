import { describe, expect, test, beforeEach, mock } from "bun:test";
import {
  dispatchCustomEvent,
  consumeEditorFileChanged,
  consumePreviewServerDetected,
  consumeReasoning,
  consumeThinkStatus,
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

describe("consumeThinkDocumentReady", () => {
  test("does not mark Think ready from document markers when workspace files are missing", async () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      pushBuildActivity: mock(() => {}),
      setBuildProgress: mock(() => {}),
      updateBuildManifestTask: mock(() => {}),
      setThinkStep: mock(() => {}),
      pushResearchFinding: mock(() => {}),
      pushPendingQuestion: mock(() => {}),
      clearPendingQuestions: mock(() => {}),
      setResearchBriefPath: mock(() => {}),
      setPrdPath: mock(() => {}),
      setTrdPath: mock((path: string | null) => {
        store.trdPath = path;
      }),
      setPlanStep: mock(() => {}),
      pushPlanActivity: mock(() => {}),
      updateArchitecturePlanSection: mock(() => {}),
      pushThinkActivity: mock(() => {}),
      devStage: "think",
      agentSandboxId: "sandbox-1",
      architecturePlan: null,
      name: "Test Agent",
      description: "Does things.",
      researchBriefPath: ".openclaw/discovery/research-brief.md",
      prdPath: ".openclaw/discovery/PRD.md",
      trdPath: null as string | null,
      thinkStatus: "generating",
    };
    const deps = createMockDeps({
      coPilotStore: store as unknown as ConsumerDeps["coPilotStore"],
    });

    dispatchCustomEvent(CustomEventName.THINK_DOCUMENT_READY, {
      docType: "trd",
      path: ".openclaw/discovery/TRD.md",
    }, deps);
    await Promise.resolve();

    expect(store.setDiscoveryDocuments).not.toHaveBeenCalled();
    expect(store.setThinkStep).not.toHaveBeenCalledWith("complete");
    expect(store.setThinkStatus).not.toHaveBeenCalledWith("ready");
  });

  test("hydrates discovery docs and marks Think ready after PRD/TRD files are verified", async () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      pushBuildActivity: mock(() => {}),
      setBuildProgress: mock(() => {}),
      updateBuildManifestTask: mock(() => {}),
      setThinkStep: mock(() => {}),
      pushResearchFinding: mock(() => {}),
      pushPendingQuestion: mock(() => {}),
      clearPendingQuestions: mock(() => {}),
      setResearchBriefPath: mock(() => {}),
      setPrdPath: mock(() => {}),
      setTrdPath: mock((path: string | null) => {
        store.trdPath = path;
      }),
      setPlanStep: mock(() => {}),
      pushPlanActivity: mock(() => {}),
      updateArchitecturePlanSection: mock(() => {}),
      pushThinkActivity: mock(() => {}),
      devStage: "think",
      agentSandboxId: "sandbox-1",
      architecturePlan: null,
      name: "Test Agent",
      description: "Does things.",
      researchBriefPath: ".openclaw/discovery/research-brief.md",
      prdPath: ".openclaw/discovery/PRD.md",
      trdPath: null as string | null,
      thinkStatus: "generating",
      snapshot() {
        return {
          researchBriefPath: this.researchBriefPath,
          prdPath: this.prdPath,
          trdPath: this.trdPath,
          thinkStatus: this.thinkStatus,
          agentSandboxId: this.agentSandboxId,
          discoveryDocuments: null,
        };
      },
    };
    const deps = createMockDeps({
      coPilotStore: store as unknown as ConsumerDeps["coPilotStore"],
      readWorkspaceFile: mock(async (_sandboxId: string, path: string) => {
        if (path.endsWith("PRD.md")) return "# PRD\n\n## Goals\nClear estimating goals.";
        if (path.endsWith("TRD.md")) return "# TRD\n\n## System\nClear technical plan.";
        return null;
      }),
    });

    dispatchCustomEvent(CustomEventName.THINK_DOCUMENT_READY, {
      docType: "trd",
      path: ".openclaw/discovery/TRD.md",
    }, deps);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.setDiscoveryDocuments).toHaveBeenCalledWith({
      prd: { title: "PRD", sections: [{ heading: "Goals", content: "Clear estimating goals." }] },
      trd: { title: "TRD", sections: [{ heading: "System", content: "Clear technical plan." }] },
    });
    expect(store.setThinkStep).toHaveBeenCalledWith("complete");
    expect(store.setThinkStatus).toHaveBeenCalledWith("ready");
  });
});

describe("consumeArchitecturePlanReady", () => {
  test("drops if coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    consumeArchitecturePlanReady({ plan: {} }, deps);
    expect(deps.setMessages).toHaveBeenCalled();
  });
});

describe("plan readiness events", () => {
  test("does not mark Plan ready from plan_complete when architecture.json is missing", async () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      pushBuildActivity: mock(() => {}),
      setBuildProgress: mock(() => {}),
      updateBuildManifestTask: mock(() => {}),
      setThinkStep: mock(() => {}),
      pushResearchFinding: mock(() => {}),
      pushPendingQuestion: mock(() => {}),
      clearPendingQuestions: mock(() => {}),
      setResearchBriefPath: mock(() => {}),
      setPrdPath: mock(() => {}),
      setTrdPath: mock(() => {}),
      setPlanStep: mock(() => {}),
      pushPlanActivity: mock(() => {}),
      updateArchitecturePlanSection: mock(() => {}),
      pushThinkActivity: mock(() => {}),
      devStage: "plan",
      agentSandboxId: "sandbox-1",
      architecturePlan: null,
      name: "Test Agent",
      description: "Does things.",
    };
    const deps = createMockDeps({
      coPilotStore: store as unknown as ConsumerDeps["coPilotStore"],
      readWorkspaceFile: mock(async () => null),
    });

    dispatchCustomEvent(CustomEventName.PLAN_COMPLETE, {}, deps);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.setArchitecturePlan).not.toHaveBeenCalled();
    expect(store.setPlanStatus).not.toHaveBeenCalledWith("ready");
    expect(store.setPlanStatus).toHaveBeenCalledWith("failed");
  });

  test("drops empty architecture_plan_ready payloads instead of marking Plan ready", () => {
    const store = {
      setDiscoveryDocuments: mock(() => {}),
      setThinkStatus: mock(() => {}),
      setDevStage: mock(() => {}),
      setPhase: mock(() => {}),
      setArchitecturePlan: mock(() => {}),
      setPlanStatus: mock(() => {}),
      setBuildStatus: mock(() => {}),
      pushBuildActivity: mock(() => {}),
      setBuildProgress: mock(() => {}),
      updateBuildManifestTask: mock(() => {}),
      setThinkStep: mock(() => {}),
      pushResearchFinding: mock(() => {}),
      pushPendingQuestion: mock(() => {}),
      clearPendingQuestions: mock(() => {}),
      setResearchBriefPath: mock(() => {}),
      setPrdPath: mock(() => {}),
      setTrdPath: mock(() => {}),
      setPlanStep: mock(() => {}),
      pushPlanActivity: mock(() => {}),
      updateArchitecturePlanSection: mock(() => {}),
      pushThinkActivity: mock(() => {}),
      devStage: "plan",
      agentSandboxId: "sandbox-1",
      architecturePlan: null,
      name: "Test Agent",
      description: "Does things.",
    };
    const deps = createMockDeps({
      coPilotStore: store as unknown as ConsumerDeps["coPilotStore"],
    });

    dispatchCustomEvent("architecture_plan_ready", {
      plan: { skills: [], workflow: { steps: [] } },
    }, deps);

    expect(store.setArchitecturePlan).not.toHaveBeenCalled();
    expect(store.setPlanStatus).not.toHaveBeenCalledWith("ready");
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
});
