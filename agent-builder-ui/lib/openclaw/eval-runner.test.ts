import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EvalTask } from "./types";

const mockSendToArchitectStreaming = mock(async () => ({
  type: "agent_response" as const,
  content: "architect fallback",
}));

const mockCollectExecutionTrace = mock(async () => ({
  response: "trace response",
  toolCalls: [],
  skillsActivated: [],
  errors: [],
  totalDurationMs: 250,
}));

const mockScoreExecutionTrace = mock(async () => ({
  passed: true,
  score: 1,
  feedback: "ok",
  skillDiagnosis: [],
  suggestedFixes: [],
}));

mock.module("./api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

mock.module("./eval-trace-collector", () => ({
  collectExecutionTrace: mockCollectExecutionTrace,
}));

mock.module("./eval-trace-scorer", () => ({
  scoreExecutionTrace: mockScoreExecutionTrace,
}));

describe("runEvalSuite", () => {
  beforeEach(() => {
    mockSendToArchitectStreaming.mockReset();
    mockCollectExecutionTrace.mockReset();
    mockScoreExecutionTrace.mockReset();
  });

  test("keeps tasks pending and never falls back to architect when sandbox is missing", async () => {
    const { runEvalSuite } = await import("./eval-runner");
    const { TEST_STAGE_CONTAINER_NOT_READY_REASON } = await import("./test-stage-readiness");

    const updateEvalTask = mock(() => {});
    const setEvalStatus = mock(() => {});
    const tasks: EvalTask[] = [{
      id: "eval-1",
      title: "Smoke test",
      input: "hello",
      expectedBehavior: "reply helpfully",
      status: "pending",
    }];

    const results = await runEvalSuite(tasks, {
      sessionId: "session-1",
      store: { updateEvalTask, setEvalStatus },
      skillGraph: [],
      agentRules: [],
      mode: "mock",
      agentSandboxId: null,
    });

    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
    expect(mockCollectExecutionTrace).not.toHaveBeenCalled();
    expect(mockScoreExecutionTrace).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pending");
    expect(results[0].reasons).toEqual([TEST_STAGE_CONTAINER_NOT_READY_REASON]);
    expect(setEvalStatus).toHaveBeenNthCalledWith(1, "running");
    expect(setEvalStatus).toHaveBeenLastCalledWith("done");
    expect(updateEvalTask).toHaveBeenCalledWith("eval-1", { status: "running" });
  });

  test("runs task against real agent when sandbox is provided", async () => {
    const { runEvalSuite } = await import("./eval-runner");

    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "Detailed revenue report for yesterday: $12,500 across 5 campaigns.",
      toolCalls: [],
      skillsActivated: ["reporting"],
      errors: [],
      totalDurationMs: 300,
    });
    mockScoreExecutionTrace.mockResolvedValueOnce({
      passed: true,
      score: 0.9,
      feedback: "Good response",
      skillDiagnosis: [],
      suggestedFixes: [],
    });

    const updateEvalTask = mock(() => {});
    const setEvalStatus = mock(() => {});
    const tasks = [{
      id: "eval-live",
      title: "Live smoke test",
      input: "Show revenue",
      expectedBehavior: "Revenue summary",
      status: "pending" as const,
    }];

    const results = await runEvalSuite(tasks, {
      sessionId: "session-live",
      store: { updateEvalTask, setEvalStatus },
      skillGraph: [],
      agentRules: [],
      mode: "live",
      agentSandboxId: "sandbox-live-abc",
    });

    expect(mockCollectExecutionTrace).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe("pass");
  });

  test("sets status to running then done even when all tasks complete quickly", async () => {
    const { runEvalSuite } = await import("./eval-runner");

    const updateEvalTask = mock(() => {});
    const setEvalStatus = mock(() => {});

    await runEvalSuite([], {
      sessionId: "session-empty",
      store: { updateEvalTask, setEvalStatus },
      skillGraph: [],
      agentRules: [],
      mode: "mock",
      agentSandboxId: null,
    });

    expect(setEvalStatus).toHaveBeenCalledWith("running");
    expect(setEvalStatus).toHaveBeenLastCalledWith("done");
  });
});
