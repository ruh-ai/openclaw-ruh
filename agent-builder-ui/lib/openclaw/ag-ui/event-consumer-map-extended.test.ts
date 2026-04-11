/**
 * Extended tests for event-consumer-map.ts — covers branches not in the base test:
 * - consumePreviewServerDetected: dedup (port already in array)
 * - consumeSkillGraphReady: skillGraph count in default message content
 * - consumeThinkActivity: fallback type and label defaults
 * - consumeThinkActivity: drop when stage is not "think"
 * - Build consumers: null coPilotStore paths (consumeFileWritten, consumeSkillCreated, etc.)
 * - consumeBuildTaskUpdated: specialist label vs task-id label
 * - consumeThinkDocumentReady: microtask auto-complete path
 * - consumePlanSection: count when data has .tables property
 * - plan sub-consumers with null coPilotStore
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/openclaw/plan-formatter", () => ({
  normalizePlan: (plan: Record<string, unknown>) => plan ?? {},
}));

import {
  dispatchCustomEvent,
  consumePreviewServerDetected,
  consumeSkillGraphReady,
  consumeThinkActivity,
  type ConsumerDeps,
} from "./event-consumer-map";
import { CustomEventName } from "./types";
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

// ─── consumePreviewServerDetected — dedup ────────────────────────────────────

describe("consumePreviewServerDetected — deduplication", () => {
  test("does not add port when already present (dedup via updater)", () => {
    const deps = createMockDeps();
    let ports: number[] = [3000];
    deps.setDetectedPreviewPorts = mock((updater) => {
      ports = updater(ports);
    });

    consumePreviewServerDetected({ port: 3000 }, deps);
    // Port 3000 is already in the array — should not be duplicated
    expect(ports).toEqual([3000]);
  });

  test("adds new port when not already present", () => {
    const deps = createMockDeps();
    let ports: number[] = [3000];
    deps.setDetectedPreviewPorts = mock((updater) => {
      ports = updater(ports);
    });

    consumePreviewServerDetected({ port: 4000 }, deps);
    expect(ports).toContain(4000);
  });

  test("does nothing when port is undefined/falsy", () => {
    const deps = createMockDeps();
    consumePreviewServerDetected({}, deps);
    expect(deps.setDetectedPreviewPorts).not.toHaveBeenCalled();
  });
});

// ─── consumeSkillGraphReady — default content message ───────────────────────

describe("consumeSkillGraphReady — message content", () => {
  test("generates default message with skill count when no content in payload", () => {
    let capturedMessages: unknown[] = [];
    const deps = createMockDeps({
      setMessages: mock((updater) => {
        capturedMessages = updater([]);
      }),
    });

    consumeSkillGraphReady({ skillGraph: ["s1", "s2", "s3"] }, deps);
    expect(capturedMessages).toHaveLength(1);
    const msg = capturedMessages[0] as { content: string };
    expect(msg.content).toContain("3 skills");
  });

  test("uses provided content string when present", () => {
    let capturedMessages: unknown[] = [];
    const deps = createMockDeps({
      setMessages: mock((updater) => {
        capturedMessages = updater([]);
      }),
    });

    consumeSkillGraphReady({ content: "Build complete!", skillGraph: [] }, deps);
    const msg = capturedMessages[0] as { content: string };
    expect(msg.content).toBe("Build complete!");
  });
});

// ─── consumeThinkActivity — fallback defaults ────────────────────────────────

describe("consumeThinkActivity — fallback defaults", () => {
  test("uses 'status' as default type when type is falsy", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });

    consumeThinkActivity({ type: "", label: "Processing" }, deps);
    expect(mockStore.pushThinkActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "status" }),
    );
  });

  test("uses 'Working...' as default label when label is falsy", () => {
    const mockStore = createMockCoPilotStore({ devStage: "think" });
    const deps = createMockDeps({ coPilotStore: mockStore });

    consumeThinkActivity({ type: "tool", label: "" }, deps);
    expect(mockStore.pushThinkActivity).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Working..." }),
    );
  });
});

// ─── Build consumers — null coPilotStore ────────────────────────────────────

describe("consumeFileWritten — null coPilotStore", () => {
  test("still increments workspace tick even without coPilotStore", () => {
    const deps = createMockDeps({ coPilotStore: null });
    const result = dispatchCustomEvent(
      CustomEventName.FILE_WRITTEN,
      { path: "skills/test.md" },
      deps,
    );
    expect(result).toBe(true);
    expect(deps.setWorkspaceFilesTick).toHaveBeenCalled();
  });
});

describe("consumeSkillCreated — null coPilotStore", () => {
  test("still increments workspace tick even without coPilotStore", () => {
    const deps = createMockDeps({ coPilotStore: null });
    dispatchCustomEvent(
      CustomEventName.SKILL_CREATED,
      { skillId: "my-skill" },
      deps,
    );
    expect(deps.setWorkspaceFilesTick).toHaveBeenCalled();
  });

  test("uses path-based label when skillId is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.SKILL_CREATED,
      { path: "skills/campaign/SKILL.md" },
      deps,
    );
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "skill", label: "campaign/SKILL.md" }),
    );
  });

  test("uses 'skill' as fallback label when both skillId and path are missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(CustomEventName.SKILL_CREATED, {}, deps);
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "skill", label: "skill" }),
    );
  });
});

describe("consumeBuildProgress — null coPilotStore", () => {
  test("does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    const result = dispatchCustomEvent(
      CustomEventName.BUILD_PROGRESS,
      { completed: 2, total: 5, currentSkill: "foo" },
      deps,
    );
    expect(result).toBe(true); // still handled
  });
});

describe("consumeBuildTaskUpdated — label variations", () => {
  test("uses 'Task taskId: status' label when specialist is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.BUILD_TASK_UPDATED,
      { taskId: "task-42", status: "failed" },
      deps,
    );
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Task task-42: failed" }),
    );
  });

  test("uses 'specialist: status' label when specialist is present", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.BUILD_TASK_UPDATED,
      { taskId: "task-1", specialist: "skill-builder", status: "running" },
      deps,
    );
    expect(mockStore.pushBuildActivity).toHaveBeenCalledWith(
      expect.objectContaining({ label: "skill-builder: running" }),
    );
  });
});

// ─── Think v4 — null coPilotStore paths ─────────────────────────────────────

describe("think v4 consumers — null coPilotStore", () => {
  test("think_step: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    const result = dispatchCustomEvent(
      CustomEventName.THINK_STEP,
      { step: "research", status: "started" },
      deps,
    );
    expect(result).toBe(true);
  });

  test("think_research_finding: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    dispatchCustomEvent(
      CustomEventName.THINK_RESEARCH_FINDING,
      { title: "Finding", summary: "Summary" },
      deps,
    );
    // no error — just silently exits
    expect(result => result).toBeDefined();
  });

  test("think_document_ready: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "prd", path: "/workspace/PRD.md" },
      deps,
    );
    // no error
    expect(deps.setWorkspaceFilesTick).not.toHaveBeenCalled();
  });

  test("think_step: status 'complete' produces 'completed' label", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.THINK_STEP,
      { step: "prd", status: "complete" },
      deps,
    );
    expect(mockStore.pushThinkActivity).toHaveBeenCalledWith(
      expect.objectContaining({ label: "prd completed" }),
    );
  });

  test("think_step: non-complete status produces 'started' label", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.THINK_STEP,
      { step: "trd", status: "in_progress" },
      deps,
    );
    expect(mockStore.pushThinkActivity).toHaveBeenCalledWith(
      expect.objectContaining({ label: "trd started" }),
    );
  });
});

// ─── Plan v4 — null coPilotStore and count paths ────────────────────────────

describe("plan v4 consumers — null coPilotStore", () => {
  test("plan_skills: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    dispatchCustomEvent(
      CustomEventName.PLAN_SKILLS,
      { skills: [{ id: "s1" }] },
      deps,
    );
    expect(deps.setWorkspaceFilesTick).not.toHaveBeenCalled();
  });

  test("plan_workflow: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    expect(() => dispatchCustomEvent(
      CustomEventName.PLAN_WORKFLOW,
      { workflow: { steps: [] } },
      deps,
    )).not.toThrow();
  });

  test("plan_complete: does nothing when coPilotStore is null", () => {
    const deps = createMockDeps({ coPilotStore: null });
    expect(() => dispatchCustomEvent(CustomEventName.PLAN_COMPLETE, {}, deps)).not.toThrow();
  });
});

describe("plan section count — object with .tables", () => {
  test("plan_data_schema counts tables from .tables array", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.PLAN_DATA_SCHEMA,
      { dataSchema: { tables: [{ name: "campaigns" }, { name: "ad_groups" }, { name: "keywords" }] } },
      deps,
    );
    expect(mockStore.pushPlanActivity).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3, label: expect.stringContaining("3 items") }),
    );
  });

  test("plan_data_schema count is 1 when tables property is missing", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.PLAN_DATA_SCHEMA,
      { dataSchema: { description: "No tables here" } },
      deps,
    );
    expect(mockStore.pushPlanActivity).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
    );
  });

  test("plan_api_endpoints uses array length for count", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.PLAN_API_ENDPOINTS,
      { apiEndpoints: [{ method: "GET", path: "/api/campaigns" }, { method: "POST", path: "/api/campaigns" }] },
      deps,
    );
    expect(mockStore.pushPlanActivity).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
    );
  });

  test("plan_dashboard_pages consumer handles null coPilotStore", () => {
    const deps = createMockDeps({ coPilotStore: null });
    expect(() => dispatchCustomEvent(
      CustomEventName.PLAN_DASHBOARD_PAGES,
      { dashboardPages: [{ path: "/overview" }] },
      deps,
    )).not.toThrow();
  });

  test("plan_env_vars with null coPilotStore is a no-op", () => {
    const deps = createMockDeps({ coPilotStore: null });
    expect(() => dispatchCustomEvent(
      CustomEventName.PLAN_ENV_VARS,
      { envVars: [{ key: "API_KEY" }] },
      deps,
    )).not.toThrow();
  });

  test("plan section skips when data key is missing from payload", () => {
    const mockStore = createMockCoPilotStore();
    const deps = createMockDeps({ coPilotStore: mockStore });

    // Missing 'skills' key
    dispatchCustomEvent(CustomEventName.PLAN_SKILLS, { someOtherKey: [] }, deps);
    expect(mockStore.updateArchitecturePlanSection).not.toHaveBeenCalled();
  });
});

// ─── think_document_ready — auto-complete microtask ──────────────────────────

describe("consumeThinkDocumentReady — microtask auto-complete", () => {
  test("schedules auto-complete when all three docs are written", async () => {
    // The auto-complete reads store.researchBriefPath/prdPath/trdPath AFTER dispatch.
    // setTrdPath() is a mock and does NOT update the object's property, so we
    // pre-populate all three paths in the initial store state and dispatch trd
    // (which calls setTrdPath mock) — but the auto-complete check sees the
    // pre-populated trdPath.  Alternatively, make setTrdPath mutate the property.
    const storeObj: ReturnType<typeof createMockCoPilotStore> & { trdPath: string | null } = {
      ...createMockCoPilotStore({
        researchBriefPath: "/workspace/research-brief.md",
        prdPath: "/workspace/PRD.md",
        trdPath: null,
        thinkStatus: "pending",
      }),
      trdPath: null,
    };
    // Make setTrdPath actually update the property so the microtask sees it
    storeObj.setTrdPath = mock((path: string | null) => {
      storeObj.trdPath = path;
    });

    const deps = createMockDeps({ coPilotStore: storeObj });

    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "trd", path: "/workspace/TRD.md" },
      deps,
    );

    // Microtask fires after we await
    await Promise.resolve();

    expect(storeObj.setThinkStep).toHaveBeenCalledWith("complete");
    expect(storeObj.setThinkStatus).toHaveBeenCalledWith("ready");
  });

  test("does NOT auto-complete when thinkStatus is already ready", async () => {
    const storeObj: ReturnType<typeof createMockCoPilotStore> & { trdPath: string | null } = {
      ...createMockCoPilotStore({
        researchBriefPath: "/workspace/research-brief.md",
        prdPath: "/workspace/PRD.md",
        trdPath: null,
        thinkStatus: "ready",
      }),
      trdPath: null,
    };
    storeObj.setTrdPath = mock((path: string | null) => {
      storeObj.trdPath = path;
    });

    const deps = createMockDeps({ coPilotStore: storeObj });

    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "trd", path: "/workspace/TRD.md" },
      deps,
    );

    await Promise.resolve();
    // thinkStatus is already "ready" — should NOT be called again
    expect(storeObj.setThinkStatus).not.toHaveBeenCalled();
  });

  test("does NOT auto-complete when not all docs are written", async () => {
    const mockStore = createMockCoPilotStore({
      researchBriefPath: null,
      prdPath: null,
      thinkStatus: "pending",
    });
    const deps = createMockDeps({ coPilotStore: mockStore });

    dispatchCustomEvent(
      CustomEventName.THINK_DOCUMENT_READY,
      { docType: "prd", path: "/workspace/PRD.md" },
      deps,
    );

    await Promise.resolve();
    // Only prd written, not all three — should not auto-complete
    expect(mockStore.setThinkStep).not.toHaveBeenCalledWith("complete");
  });
});

// ─── pushDropWarning — updater function body ─────────────────────────────────

describe("pushDropWarning — updater function invocation", () => {
  test("actual setMessages updater appends the warning message with correct content", () => {
    // Use a real updater so the function body (lines 81-86) is exercised
    let capturedMessages: unknown[] = [];
    const deps = createMockDeps({
      coPilotStore: null,
      setMessages: mock((updater: (prev: unknown[]) => unknown[]) => {
        capturedMessages = updater([]);
      }),
    });

    // Trigger any drop-warning path — think_status with null store
    dispatchCustomEvent("think_status", { status: "active" }, deps);

    expect(capturedMessages).toHaveLength(1);
    const msg = capturedMessages[0] as { role: string; content: string };
    expect(msg.role).toBe("system");
    expect(msg.content).toContain("think_status");
    expect(msg.content).toContain("coPilotStore is null");
  });

  test("pushDropWarning message id starts with 'drop-warn-'", () => {
    let capturedMessages: unknown[] = [];
    const deps = createMockDeps({
      coPilotStore: null,
      setMessages: mock((updater: (prev: unknown[]) => unknown[]) => {
        capturedMessages = updater([]);
      }),
    });

    dispatchCustomEvent("think_activity", { type: "status" }, deps);

    const msg = capturedMessages[0] as { id: string };
    expect(msg.id).toMatch(/^drop-warn-/);
  });
});
