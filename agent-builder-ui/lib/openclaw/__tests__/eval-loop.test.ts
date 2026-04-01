/**
 * Unit tests for eval-loop.ts
 *
 * Tests the reinforcement loop orchestrator:
 *   - Stopping criteria (all pass, degradation, max iterations)
 *   - Mutation tracking (accepted/reverted)
 *   - Progress callbacks
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { EvalTask, EvalLoopState, SkillGraphNode } from "../types";

// Mock all dependencies
const mockRunEvalSuite = mock(async (tasks: EvalTask[]) => tasks);
const mockReflectOnFailures = mock(async () => ({ rewrites: [], summary: "none" }));
const mockApplySkillMutations = mock(async () => ({ applied: [], failed: [] }));
const mockRevertMutations = mock(async () => {});

mock.module("../eval-runner", () => ({
  runEvalSuite: mockRunEvalSuite,
}));

mock.module("../eval-reflector", () => ({
  reflectOnFailures: mockReflectOnFailures,
}));

mock.module("../eval-mutator", () => ({
  applySkillMutations: mockApplySkillMutations,
  revertMutations: mockRevertMutations,
}));

const SKILL_GRAPH: SkillGraphNode[] = [
  { skill_id: "calc", name: "Calculator", source: "custom", status: "approved", depends_on: [] },
];

function makeTask(id: string, status: "pass" | "fail" | "pending" = "pending", confidence = 0): EvalTask {
  return { id, title: `Test ${id}`, input: "input", expectedBehavior: "expected", status, confidence };
}

function makeLoopStore() {
  let state: EvalLoopState = {
    iteration: 0,
    maxIterations: 5,
    scores: [],
    mutations: [],
    status: "idle",
  };
  return {
    updateEvalTask: mock(() => {}),
    setEvalStatus: mock(() => {}),
    setEvalLoopState: mock((partial: Partial<EvalLoopState>) => {
      state = { ...state, ...partial };
    }),
    getEvalLoopState: () => state,
  };
}

describe("eval-loop", () => {
  beforeEach(() => {
    mockRunEvalSuite.mockReset();
    mockReflectOnFailures.mockReset();
    mockApplySkillMutations.mockReset();
    mockRevertMutations.mockReset();
  });

  test("stops immediately when all tasks pass on first iteration", async () => {
    mockRunEvalSuite.mockImplementation(async (tasks) =>
      tasks.map((t: EvalTask) => ({ ...t, status: "pass" as const, confidence: 1.0 })),
    );

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();

    const result = await runEvalLoop({
      tasks: [makeTask("1"), makeTask("2")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
    });

    expect(result.stopReason).toBe("all_passed");
    expect(result.status).toBe("completed");
    // Should not call reflector since everything passed
    expect(mockReflectOnFailures).not.toHaveBeenCalled();
  });

  test("stops after max iterations", async () => {
    // Always return failures
    mockRunEvalSuite.mockImplementation(async (tasks) =>
      tasks.map((t: EvalTask) => ({ ...t, status: "fail" as const, confidence: 0.3 })),
    );
    mockReflectOnFailures.mockResolvedValue({
      rewrites: [{ skillId: "calc", newContent: "new", rationale: "fix" }],
      summary: "proposed fix",
    });
    mockApplySkillMutations.mockResolvedValue({
      applied: [{ iteration: 1, skillId: "calc", before: "old", after: "new", rationale: "fix", accepted: false }],
      failed: [],
    });

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();

    const result = await runEvalLoop({
      tasks: [makeTask("1")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopConfig: { maxIterations: 3, maxConsecutiveDegradations: 2, reloadPauseMs: 0 },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
    });

    expect(result.stopReason).toBe("max_iterations");
    expect(result.scores.length).toBe(3);
  });

  test("stops and reverts on consecutive score degradation", async () => {
    let callCount = 0;
    mockRunEvalSuite.mockImplementation(async (tasks) => {
      callCount++;
      // Iteration 1: score 0.5, Iteration 2: score 0.3 (degraded), Iteration 3: score 0.2 (degraded again)
      const confidence = callCount === 1 ? 0.5 : callCount === 2 ? 0.3 : 0.2;
      return tasks.map((t: EvalTask) => ({ ...t, status: "fail" as const, confidence }));
    });
    mockReflectOnFailures.mockResolvedValue({
      rewrites: [{ skillId: "calc", newContent: "new", rationale: "fix" }],
      summary: "fix",
    });
    mockApplySkillMutations.mockResolvedValue({
      applied: [{ iteration: 1, skillId: "calc", before: "old", after: "new", rationale: "fix", accepted: false }],
      failed: [],
    });

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();

    const result = await runEvalLoop({
      tasks: [makeTask("1")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopConfig: { maxIterations: 5, maxConsecutiveDegradations: 2, reloadPauseMs: 0 },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
    });

    expect(result.stopReason).toBe("degraded");
    expect(result.status).toBe("degraded");
    // Should have called revert
    expect(mockRevertMutations).toHaveBeenCalled();
  });

  test("stops when reflector proposes no changes", async () => {
    mockRunEvalSuite.mockImplementation(async (tasks) =>
      tasks.map((t: EvalTask) => ({ ...t, status: "fail" as const, confidence: 0.4 })),
    );
    mockReflectOnFailures.mockResolvedValue({ rewrites: [], summary: "no fixes" });

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();

    const result = await runEvalLoop({
      tasks: [makeTask("1")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopConfig: { maxIterations: 5, maxConsecutiveDegradations: 2, reloadPauseMs: 0 },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
    });

    expect(result.stopReason).toBe("no_actionable_changes");
  });

  test("fires progress callbacks", async () => {
    mockRunEvalSuite.mockImplementation(async (tasks) =>
      tasks.map((t: EvalTask) => ({ ...t, status: "pass" as const, confidence: 1.0 })),
    );

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();
    const progressCalls: string[] = [];

    await runEvalLoop({
      tasks: [makeTask("1")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopConfig: { maxIterations: 3, maxConsecutiveDegradations: 2, reloadPauseMs: 0 },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
      onLoopProgress: (p) => progressCalls.push(p.phase),
    });

    expect(progressCalls).toContain("running");
    expect(progressCalls).toContain("scoring");
  });

  test("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    mockRunEvalSuite.mockImplementation(async (tasks) =>
      tasks.map((t: EvalTask) => ({ ...t, status: "pending" as const, confidence: 0 })),
    );

    const { runEvalLoop } = await import("../eval-loop");
    const store = makeLoopStore();

    const result = await runEvalLoop({
      tasks: [makeTask("1")],
      evalRunnerConfig: {
        sessionId: "s",
        store,
        skillGraph: SKILL_GRAPH,
        agentRules: [],
        mode: "mock",
        agentSandboxId: "sandbox-1",
      },
      loopStore: store,
      skillGraph: SKILL_GRAPH,
      sessionId: "s",
      sandboxId: "sandbox-1",
      signal: controller.signal,
    });

    expect(result.stopReason).toBe("aborted");
  });
});
