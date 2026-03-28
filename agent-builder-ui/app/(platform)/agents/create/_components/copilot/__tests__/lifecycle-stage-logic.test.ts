/**
 * Tests for LifecycleStepRenderer stage logic.
 *
 * These test the pure logic functions extracted from the component:
 * isStageLoading, isStageUnlocked, isStageDone, stepper guards,
 * and the re-run-failed test runner behavior.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { AGENT_DEV_STAGES, type AgentDevStage, type StageStatus } from "@/lib/openclaw/types";
import { useCoPilotStore } from "@/lib/openclaw/copilot-state";
import { getStageInputPlaceholder } from "../LifecycleStepRenderer";

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

function isStageUnlocked(stage: AgentDevStage, currentStage: AgentDevStage): boolean {
  const idx = AGENT_DEV_STAGES.indexOf(stage);
  const currentIdx = AGENT_DEV_STAGES.indexOf(currentStage);
  if (idx === 0) return true;
  if (idx <= currentIdx) return true;
  return false;
}

function isStageDone(stage: AgentDevStage, currentStage: AgentDevStage): boolean {
  const idx = AGENT_DEV_STAGES.indexOf(stage);
  const currentIdx = AGENT_DEV_STAGES.indexOf(currentStage);
  return idx < currentIdx;
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
    expect(isStageUnlocked("think", "think")).toBe(true);
    expect(isStageUnlocked("think", "reflect")).toBe(true);
  });

  test("current and past stages are unlocked", () => {
    expect(isStageUnlocked("think", "build")).toBe(true);
    expect(isStageUnlocked("plan", "build")).toBe(true);
    expect(isStageUnlocked("build", "build")).toBe(true);
  });

  test("future stages are locked", () => {
    expect(isStageUnlocked("review", "build")).toBe(false);
    expect(isStageUnlocked("ship", "think")).toBe(false);
  });
});

// ─── isStageDone ──────────────────────────────────────────────────────────

describe("isStageDone", () => {
  test("stages before current are done", () => {
    expect(isStageDone("think", "build")).toBe(true);
    expect(isStageDone("plan", "build")).toBe(true);
  });

  test("current stage is not done", () => {
    expect(isStageDone("build", "build")).toBe(false);
  });

  test("stages after current are not done", () => {
    expect(isStageDone("ship", "build")).toBe(false);
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
    const stages = ["think", "plan", "build", "review", "test", "ship", "reflect"];
    const placeholders = stages.map(s => getStageInputPlaceholder(s, true, "X"));
    const unique = new Set(placeholders);
    expect(unique.size).toBe(stages.length);
  });
});
