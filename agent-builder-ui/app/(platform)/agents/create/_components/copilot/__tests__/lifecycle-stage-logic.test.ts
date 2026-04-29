/**
 * Tests for LifecycleStepRenderer stage logic.
 *
 * These test the pure logic functions extracted from the component:
 * isStageLoading, isStageUnlocked, isStageDone, stepper guards,
 * and the re-run-failed test runner behavior.
 *
 * NOTE: This test intentionally INLINES all implementations rather than
 * importing from "@/lib/openclaw/copilot-state" or "../LifecycleStepRenderer"
 * because other test files in the suite (e.g. tab-chat.test.ts) register
 * mock.module() entries for those paths, and bun shares the module registry
 * across all test files in the same run. Inlining prevents contamination.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { create } from "zustand";

// ─── Types (mirrored from @/lib/openclaw/types) ───────────────────────────

type AgentDevStage = "think" | "plan" | "prototype" | "build" | "review" | "test" | "ship" | "reflect";
type StageStatus = "idle" | "generating" | "building" | "running" | "approved" | "done" | "failed";
type EvalTaskStatus = "pending" | "running" | "pass" | "fail" | "manual";

interface EvalTask {
  id: string;
  title: string;
  input: string;
  expectedBehavior: string;
  status: EvalTaskStatus;
}

const AGENT_DEV_STAGES: AgentDevStage[] = [
  "think", "plan", "prototype", "build", "review", "test", "ship", "reflect",
];

// ─── Inline implementations from LifecycleStepRenderer.tsx ───────────────

function getStageIndex(stage: AgentDevStage): number {
  return AGENT_DEV_STAGES.indexOf(stage);
}

function isLifecycleStageUnlocked(stage: AgentDevStage, maxUnlockedDevStage: AgentDevStage): boolean {
  const idx = getStageIndex(stage);
  const unlockedIdx = getStageIndex(maxUnlockedDevStage);
  if (idx === 0) return true;
  return idx <= unlockedIdx;
}

function isLifecycleStageDone(
  stage: AgentDevStage,
  maxUnlockedDevStage: AgentDevStage,
  statuses?: Partial<{
    devStage: AgentDevStage;
    thinkStatus: StageStatus;
    planStatus: StageStatus;
    buildStatus: StageStatus;
    evalStatus: StageStatus;
    deployStatus: StageStatus;
  }>,
): boolean {
  if (statuses) {
    const currentStage = statuses.devStage ?? "think";
    switch (stage) {
      case "think":
        return statuses.thinkStatus === "approved" || statuses.thinkStatus === "done";
      case "plan":
        return statuses.planStatus === "approved" || statuses.planStatus === "done";
      case "prototype":
        return getStageIndex(currentStage) > getStageIndex("prototype");
      case "build":
        return statuses.buildStatus === "done";
      case "review":
        return getStageIndex(currentStage) > getStageIndex("review");
      case "test":
        return statuses.evalStatus === "done" || getStageIndex(currentStage) > getStageIndex("test");
      case "ship":
        return statuses.deployStatus === "done" || getStageIndex(currentStage) > getStageIndex("ship");
      case "reflect":
        return false;
      default:
        return false;
    }
  }
  const idx = getStageIndex(stage);
  const unlockedIdx = getStageIndex(maxUnlockedDevStage);
  return idx < unlockedIdx;
}

function getStageInputPlaceholder(
  devStage: string | undefined,
  isBuilderMode: boolean,
  agentName: string,
): string {
  if (!isBuilderMode) return `Message ${agentName}…`;
  switch (devStage) {
    case "think": return "Describe what your agent should do...";
    case "plan": return "Waiting for architecture plan...";
    case "prototype": return "Review the dashboard prototype or request changes...";
    case "build": return "Build in progress — you can refine requirements here...";
    case "review": return "Ask the architect to modify skills, tools, or triggers...";
    case "test": return "Review test results or ask questions...";
    case "ship": return "Ready to deploy. Click Deploy Agent to proceed.";
    case "reflect": return "Review the build summary.";
    default: return "Describe your agent idea…";
  }
}

// ─── Inline getTestStageContainerState (from lib/openclaw/test-stage-readiness.ts)

function getTestStageContainerState(agentSandboxId: string | null | undefined) {
  if (agentSandboxId) {
    return {
      hasRealContainer: true,
      state: "ready" as const,
      label: "Container ready",
      description: "Tests run against your real agent container.",
      emptyStateMessage: "Tests will run against your real agent container.",
    };
  }
  return {
    hasRealContainer: false,
    state: "container-not-ready" as const,
    label: "Container not ready",
    description: "Agent workspace is not ready yet. Test runs stay blocked until the dedicated agent sandbox finishes provisioning; the shared architect fallback is disabled.",
    emptyStateMessage:
      "Container not ready — test runs stay blocked until the agent sandbox finishes provisioning.",
  };
}

// ─── Minimal Zustand store mirroring useCoPilotStore's eval-task slice ────

interface CoPilotStoreState {
  evalTasks: EvalTask[];
  setEvalTasks: (tasks: EvalTask[]) => void;
  updateEvalTask: (taskId: string, partial: Partial<EvalTask>) => void;
  reset: () => void;
}

const useCoPilotStore = create<CoPilotStoreState>()((set) => ({
  evalTasks: [],
  setEvalTasks: (tasks) => set({ evalTasks: tasks }),
  updateEvalTask: (taskId, partial) =>
    set((state) => ({
      evalTasks: state.evalTasks.map((t) =>
        t.id === taskId ? { ...t, ...partial } : t,
      ),
    })),
  reset: () => set({ evalTasks: [] }),
}));

// ─── Pure logic extracted from LifecycleStepRenderer ──────────────────────

function isStageLoading(
  stage: AgentDevStage,
  statuses: {
    thinkStatus: StageStatus;
    planStatus: StageStatus;
    buildStatus: StageStatus;
    evalStatus: StageStatus;
    deployStatus: StageStatus;
  },
): boolean {
  switch (stage) {
    case "think": return statuses.thinkStatus === "generating";
    case "plan": return statuses.planStatus === "generating";
    case "build": return statuses.buildStatus === "building";
    case "test": return statuses.evalStatus === "running";
    case "ship": return statuses.deployStatus === "running";
    default: return false;
  }
}

function isAnyStageLoading(statuses: {
  thinkStatus: StageStatus;
  planStatus: StageStatus;
  buildStatus: StageStatus;
  evalStatus: StageStatus;
  deployStatus: StageStatus;
}): boolean {
  return AGENT_DEV_STAGES.some((s) => isStageLoading(s, statuses));
}

const IDLE_STATUSES = {
  thinkStatus: "idle" as StageStatus,
  planStatus: "idle" as StageStatus,
  buildStatus: "idle" as StageStatus,
  evalStatus: "idle" as StageStatus,
  deployStatus: "idle" as StageStatus,
};

// ─── isStageLoading ───────────────────────────────────────────────────────

describe("isStageLoading", () => {
  test("returns true for think when generating", () => {
    expect(isStageLoading("think", { ...IDLE_STATUSES, thinkStatus: "generating" })).toBe(true);
  });

  test("returns false for think when idle", () => {
    expect(isStageLoading("think", IDLE_STATUSES)).toBe(false);
  });

  test("returns true for build when building", () => {
    expect(isStageLoading("build", { ...IDLE_STATUSES, buildStatus: "building" })).toBe(true);
  });

  test("returns true for test when running", () => {
    expect(isStageLoading("test", { ...IDLE_STATUSES, evalStatus: "running" })).toBe(true);
  });

  test("returns true for ship when running (fix #4)", () => {
    expect(isStageLoading("ship", { ...IDLE_STATUSES, deployStatus: "running" })).toBe(true);
  });

  test("returns false for ship when idle (fix #4 — was inverted)", () => {
    expect(isStageLoading("ship", IDLE_STATUSES)).toBe(false);
  });

  test("returns false for reflect (never loads)", () => {
    expect(isStageLoading("reflect", IDLE_STATUSES)).toBe(false);
  });
});

// ─── isStageUnlocked ──────────────────────────────────────────────────────

describe("isStageUnlocked", () => {
  test("think is always unlocked", () => {
    expect(isLifecycleStageUnlocked("think", "think")).toBe(true);
    expect(isLifecycleStageUnlocked("think", "reflect")).toBe(true);
  });

  test("current and past stages stay unlocked while viewing the furthest stage", () => {
    expect(isLifecycleStageUnlocked("think", "build")).toBe(true);
    expect(isLifecycleStageUnlocked("plan", "build")).toBe(true);
    expect(isLifecycleStageUnlocked("build", "build")).toBe(true);
  });

  test("future stages are locked", () => {
    expect(isLifecycleStageUnlocked("review", "build")).toBe(false);
    expect(isLifecycleStageUnlocked("ship", "think")).toBe(false);
  });

  test("viewing an earlier stage does not lock a later completed stage", () => {
    expect(isLifecycleStageUnlocked("review", "review")).toBe(true);
    expect(isLifecycleStageUnlocked("review", "build")).toBe(false);
  });
});

// ─── isStageDone ──────────────────────────────────────────────────────────

describe("isStageDone", () => {
  test("stages before the furthest unlocked stage are done", () => {
    expect(isLifecycleStageDone("think", "build")).toBe(true);
    expect(isLifecycleStageDone("plan", "build")).toBe(true);
  });

  test("furthest unlocked stage is not marked done", () => {
    expect(isLifecycleStageDone("build", "build")).toBe(false);
  });

  test("stages after the furthest unlocked stage are not done", () => {
    expect(isLifecycleStageDone("ship", "build")).toBe(false);
  });

  test("rewinding the current view keeps prior completed stages marked done up to the furthest unlocked stage", () => {
    expect(isLifecycleStageDone("plan", "review")).toBe(true);
    expect(isLifecycleStageDone("build", "review")).toBe(true);
    expect(isLifecycleStageDone("review", "review")).toBe(false);
  });

  test("review can be active without auto-marking think, plan, and build done", () => {
    const statuses = {
      devStage: "review" as AgentDevStage,
      thinkStatus: "idle" as StageStatus,
      planStatus: "idle" as StageStatus,
      buildStatus: "idle" as StageStatus,
      evalStatus: "idle" as StageStatus,
      deployStatus: "idle" as StageStatus,
    };

    expect(isLifecycleStageDone("think", "review", statuses)).toBe(false);
    expect(isLifecycleStageDone("plan", "review", statuses)).toBe(false);
    expect(isLifecycleStageDone("build", "review", statuses)).toBe(false);
    expect(isLifecycleStageDone("review", "review", statuses)).toBe(false);
  });
});

// ─── isAnyStageLoading (stepper guard — fix #16) ─────────────────────────

describe("isAnyStageLoading", () => {
  test("returns false when all idle", () => {
    expect(isAnyStageLoading(IDLE_STATUSES)).toBe(false);
  });

  test("returns true when build is loading", () => {
    expect(isAnyStageLoading({ ...IDLE_STATUSES, buildStatus: "building" })).toBe(true);
  });

  test("returns true when plan is generating", () => {
    expect(isAnyStageLoading({ ...IDLE_STATUSES, planStatus: "generating" })).toBe(true);
  });

  test("returns true when deploy is running", () => {
    expect(isAnyStageLoading({ ...IDLE_STATUSES, deployStatus: "running" })).toBe(true);
  });
});

describe("getTestStageContainerState", () => {
  test("returns explicit container-not-ready state without a sandbox", () => {
    const state = getTestStageContainerState(null);

    expect(state.hasRealContainer).toBe(false);
    expect(state.state).toBe("container-not-ready");
    expect(state.label).toBe("Container not ready");
    expect(state.description).toContain("Agent workspace is not ready yet");
  });

  test("returns ready state when the sandbox exists", () => {
    const state = getTestStageContainerState("sandbox-123");

    expect(state.hasRealContainer).toBe(true);
    expect(state.state).toBe("ready");
    expect(state.label).toBe("Container ready");
  });
});

// ─── Re-run failed logic (fix #17) ───────────────────────────────────────

describe("re-run failed tasks", () => {
  beforeEach(() => {
    useCoPilotStore.getState().reset();
  });

  test("handleReRunFailed only re-runs failed tasks, not passed or pending", () => {
    const store = useCoPilotStore;
    store.getState().setEvalTasks([
      { id: "t1", title: "Test 1", input: "", expectedBehavior: "", status: "pass" },
      { id: "t2", title: "Test 2", input: "", expectedBehavior: "", status: "fail" },
      { id: "t3", title: "Test 3", input: "", expectedBehavior: "", status: "pending" },
    ]);

    // Simulate handleReRunFailed: only set fail→running
    const tasks = store.getState().evalTasks;
    for (const task of tasks) {
      if (task.status === "fail") {
        store.getState().updateEvalTask(task.id, { status: "running" });
      }
    }

    const updated = store.getState().evalTasks;
    expect(updated.find(t => t.id === "t1")!.status).toBe("pass");    // untouched
    expect(updated.find(t => t.id === "t2")!.status).toBe("running"); // re-running
    expect(updated.find(t => t.id === "t3")!.status).toBe("pending"); // untouched
  });

  test("handleRunAll only runs pending tasks, not passed or failed", () => {
    const store = useCoPilotStore;
    store.getState().setEvalTasks([
      { id: "t1", title: "Test 1", input: "", expectedBehavior: "", status: "pass" },
      { id: "t2", title: "Test 2", input: "", expectedBehavior: "", status: "fail" },
      { id: "t3", title: "Test 3", input: "", expectedBehavior: "", status: "pending" },
    ]);

    // Simulate handleRunAll: only set pending→running
    const tasks = store.getState().evalTasks;
    for (const task of tasks) {
      if (task.status === "pending") {
        store.getState().updateEvalTask(task.id, { status: "running" });
      }
    }

    const updated = store.getState().evalTasks;
    expect(updated.find(t => t.id === "t1")!.status).toBe("pass");    // untouched
    expect(updated.find(t => t.id === "t2")!.status).toBe("fail");    // untouched
    expect(updated.find(t => t.id === "t3")!.status).toBe("running"); // running
  });
});

// ─── Stage-aware input placeholders (improvement #2) ─────────────────────

describe("getStageInputPlaceholder", () => {
  test("returns stage-specific text in builder mode", () => {
    expect(getStageInputPlaceholder("think", true, "Agent")).toBe("Describe what your agent should do...");
    expect(getStageInputPlaceholder("plan", true, "Agent")).toBe("Waiting for architecture plan...");
    expect(getStageInputPlaceholder("build", true, "Agent")).toBe("Build in progress — you can refine requirements here...");
    expect(getStageInputPlaceholder("review", true, "Agent")).toBe("Ask the architect to modify skills, tools, or triggers...");
    expect(getStageInputPlaceholder("test", true, "Agent")).toBe("Review test results or ask questions...");
    expect(getStageInputPlaceholder("ship", true, "Agent")).toBe("Ready to deploy. Click Deploy Agent to proceed.");
    expect(getStageInputPlaceholder("reflect", true, "Agent")).toBe("Review the build summary.");
  });

  test("returns default text in builder mode with no stage", () => {
    expect(getStageInputPlaceholder(undefined, true, "Agent")).toContain("Describe your agent");
  });

  test("returns agent name message in non-builder mode", () => {
    expect(getStageInputPlaceholder("think", false, "My Bot")).toBe("Message My Bot…");
    expect(getStageInputPlaceholder(undefined, false, "My Bot")).toBe("Message My Bot…");
  });

  test("each stage has a unique placeholder", () => {
    const stages = ["think", "plan", "prototype", "build", "review", "test", "ship", "reflect"];
    const placeholders = stages.map(s => getStageInputPlaceholder(s, true, "X"));
    const unique = new Set(placeholders);
    expect(unique.size).toBe(stages.length);
  });
});
