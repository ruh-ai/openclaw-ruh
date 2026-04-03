import { describe, expect, it, mock, beforeEach } from "bun:test";

/**
 * eval-runner.ts has heavy async dependencies (sendToArchitectStreaming,
 * collectExecutionTrace, scoreExecutionTrace, scoreEvalResponse). We test
 * the public runEvalSuite orchestration logic by mocking those dependencies.
 */

// Mock the dependencies before importing the module under test
const mockSendToArchitectStreaming = mock(() =>
  Promise.resolve({ type: "agent_response", content: "mock response" })
);
const mockScoreEvalResponse = mock(() => ({
  passed: true,
  confidence: 0.9,
  reasons: ["good"],
}));
const mockCollectExecutionTrace = mock(() =>
  Promise.resolve({
    response: "traced response",
    toolCalls: [{ toolName: "test-tool" }],
  })
);
const mockScoreExecutionTrace = mock(() =>
  Promise.resolve({
    passed: true,
    score: 0.85,
    feedback: "Looks good",
    skillDiagnosis: [],
  })
);

mock.module("./api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

mock.module("./eval-scorer", () => ({
  scoreEvalResponse: mockScoreEvalResponse,
}));

mock.module("./eval-trace-collector", () => ({
  collectExecutionTrace: mockCollectExecutionTrace,
}));

mock.module("./eval-trace-scorer", () => ({
  scoreExecutionTrace: mockScoreExecutionTrace,
}));

const { runEvalSuite } = await import("./eval-runner");

describe("runEvalSuite", () => {
  const mockStore = {
    updateEvalTask: mock(() => {}),
    setEvalStatus: mock(() => {}),
  };

  const baseConfig = {
    sessionId: "test-session",
    store: mockStore,
    skillGraph: [
      { skill_id: "test-skill", name: "Test Skill", description: "A test" },
    ] as any,
    agentRules: ["Be helpful"],
    mode: "live" as const,
  };

  const tasks = [
    {
      id: "task-1",
      title: "Test Task 1",
      input: "Hello",
      expectedBehavior: "Respond helpfully",
      status: "pending" as const,
    },
    {
      id: "task-2",
      title: "Test Task 2",
      input: "Help me",
      expectedBehavior: "Provide help",
      status: "pending" as const,
    },
  ] as any;

  beforeEach(() => {
    mockStore.updateEvalTask.mockClear();
    mockStore.setEvalStatus.mockClear();
    mockSendToArchitectStreaming.mockReset();
    mockScoreEvalResponse.mockReset();
    mockCollectExecutionTrace.mockReset();
    mockScoreExecutionTrace.mockReset();
    // Restore default implementations after each test
    mockSendToArchitectStreaming.mockImplementation(() =>
      Promise.resolve({ type: "agent_response", content: "mock response" })
    );
    mockScoreEvalResponse.mockImplementation(() => ({
      passed: true,
      confidence: 0.9,
      reasons: ["good"],
    }));
    mockCollectExecutionTrace.mockImplementation(() =>
      Promise.resolve({
        response: "traced response",
        toolCalls: [{ toolName: "test-tool" }],
      })
    );
    mockScoreExecutionTrace.mockImplementation(() =>
      Promise.resolve({
        passed: true,
        score: 0.85,
        feedback: "Looks good",
        skillDiagnosis: [],
      })
    );
  });

  it("sets status to running then done", async () => {
    const results = await runEvalSuite(tasks, baseConfig);
    expect(mockStore.setEvalStatus).toHaveBeenCalledWith("running");
    expect(mockStore.setEvalStatus).toHaveBeenCalledWith("done");
    expect(results.length).toBe(2);
  });

  it("calls updateEvalTask for each task", async () => {
    await runEvalSuite(tasks, baseConfig);
    // Each task gets status set to "running" then result update
    expect(mockStore.updateEvalTask.mock.calls.length).toBe(4);
    // First call sets task-1 to running
    expect(mockStore.updateEvalTask.mock.calls[0]).toEqual(["task-1", { status: "running" }]);
    // Second call updates task-1 with result
    expect(mockStore.updateEvalTask.mock.calls[1][0]).toBe("task-1");
  });

  it("calls onProgress callback for each task", async () => {
    const onProgress = mock(() => {});
    await runEvalSuite(tasks, { ...baseConfig, onProgress });
    expect(onProgress.mock.calls.length).toBe(2);
    expect(onProgress.mock.calls[0]).toEqual([1, 2, "Test Task 1"]);
    expect(onProgress.mock.calls[1]).toEqual([2, 2, "Test Task 2"]);
  });

  it("uses fallback path (sendToArchitectStreaming) when no agentSandboxId", async () => {
    await runEvalSuite([tasks[0]], baseConfig);
    expect(mockSendToArchitectStreaming.mock.calls.length).toBe(1);
    expect(mockCollectExecutionTrace.mock.calls.length).toBe(0);
  });

  it("uses real agent path when agentSandboxId is set", async () => {
    await runEvalSuite([tasks[0]], {
      ...baseConfig,
      agentSandboxId: "sandbox-123",
    });
    expect(mockCollectExecutionTrace.mock.calls.length).toBe(1);
    expect(mockSendToArchitectStreaming.mock.calls.length).toBe(0);
  });

  it("stops early when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await runEvalSuite(tasks, {
      ...baseConfig,
      signal: controller.signal,
    });
    expect(results.length).toBe(0);
    expect(mockStore.setEvalStatus).toHaveBeenCalledWith("idle");
  });

  it("returns results with status from scorer", async () => {
    mockScoreEvalResponse.mockImplementation(() => ({
      passed: false,
      confidence: 0.2,
      reasons: ["bad response"],
    }));

    const results = await runEvalSuite([tasks[0]], baseConfig);
    expect(results[0].status).toBe("fail");
    expect(results[0].confidence).toBe(0.2);
  });

  it("handles errors in fallback path gracefully", async () => {
    mockSendToArchitectStreaming.mockImplementation(() =>
      Promise.reject(new Error("Network error"))
    );

    const results = await runEvalSuite([tasks[0]], baseConfig);
    expect(results[0].status).toBe("fail");
    expect(results[0].response).toContain("Network error");
  });

  it("returns manual status for borderline confidence", async () => {
    mockScoreEvalResponse.mockImplementation(() => ({
      passed: false,
      confidence: 0.4,
      reasons: ["borderline"],
    }));

    const results = await runEvalSuite([tasks[0]], baseConfig);
    expect(results[0].status).toBe("manual");
  });
});
