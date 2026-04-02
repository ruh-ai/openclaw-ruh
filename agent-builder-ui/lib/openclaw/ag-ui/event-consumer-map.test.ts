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
});
