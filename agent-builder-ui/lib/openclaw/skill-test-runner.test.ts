import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SkillTestResult } from "./skill-test-runner";

const mockCollectExecutionTrace = mock(async () => ({
  response: "trace response",
  toolCalls: [],
  skillsActivated: [],
  errors: [],
  totalDurationMs: 250,
}));

const mockSendToArchitectStreaming = mock(async () => ({
  type: "agent_response" as const,
  content: "architect fallback",
}));

mock.module("./eval-trace-collector", () => ({
  collectExecutionTrace: mockCollectExecutionTrace,
}));

mock.module("./api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

describe("runSkillTest", () => {
  beforeEach(() => {
    mockCollectExecutionTrace.mockReset();
    mockSendToArchitectStreaming.mockReset();
  });

  test("skips and never falls back to architect when sandbox is missing", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    const { TEST_STAGE_CONTAINER_NOT_READY_REASON } = await import("./test-stage-readiness");

    const result = await runSkillTest(
      {
        id: "skill-smoke-1",
        skillId: "reporting",
        skillName: "Reporting",
        testType: "smoke",
        input: "Show me yesterday's revenue",
        expectedBehavior: "Returns a revenue summary",
        timeout: 10_000,
        needsConfig: false,
      },
      {
        sandboxId: null,
        sessionId: "session-1",
        skillGraph: [],
      },
    );

    expect(result.status).toBe("skip");
    expect(result.reason).toBe(TEST_STAGE_CONTAINER_NOT_READY_REASON);
    expect(mockCollectExecutionTrace).not.toHaveBeenCalled();
    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
  });
});

describe("summarizeSkillTests", () => {
  test("calculates correct summary for mixed results", async () => {
    const { summarizeSkillTests } = await import("./skill-test-runner");

    const results: SkillTestResult[] = [
      { testId: "1", skillId: "a", status: "pass", duration: 100, reason: "OK" },
      { testId: "2", skillId: "b", status: "pass", duration: 200, reason: "OK" },
      { testId: "3", skillId: "c", status: "fail", duration: 150, reason: "Failed" },
      { testId: "4", skillId: "d", status: "skip", duration: 0, reason: "Skipped" },
      { testId: "5", skillId: "e", status: "timeout", duration: 30000, reason: "Timeout" },
    ];

    const summary = summarizeSkillTests(results);
    expect(summary.total).toBe(5);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.timedOut).toBe(1);
    expect(summary.passRate).toBe(0.5);
    expect(summary.avgDuration).toBe(Math.round((100 + 200 + 150 + 30000) / 4));
  });

  test("handles all passing results", async () => {
    const { summarizeSkillTests } = await import("./skill-test-runner");

    const results: SkillTestResult[] = [
      { testId: "1", skillId: "a", status: "pass", duration: 100, reason: "OK" },
      { testId: "2", skillId: "b", status: "pass", duration: 200, reason: "OK" },
    ];

    const summary = summarizeSkillTests(results);
    expect(summary.passRate).toBe(1);
    expect(summary.failed).toBe(0);
  });

  test("handles all skipped results", async () => {
    const { summarizeSkillTests } = await import("./skill-test-runner");

    const results: SkillTestResult[] = [
      { testId: "1", skillId: "a", status: "skip", duration: 0, reason: "No config" },
      { testId: "2", skillId: "b", status: "skip", duration: 0, reason: "No config" },
    ];

    const summary = summarizeSkillTests(results);
    expect(summary.passRate).toBe(0);
    expect(summary.avgDuration).toBe(0);
    expect(summary.skipped).toBe(2);
  });

  test("handles empty results", async () => {
    const { summarizeSkillTests } = await import("./skill-test-runner");

    const summary = summarizeSkillTests([]);
    expect(summary.total).toBe(0);
    expect(summary.passRate).toBe(0);
    expect(summary.avgDuration).toBe(0);
  });
});
