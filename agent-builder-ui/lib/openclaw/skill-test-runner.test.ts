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

  test("passes when trace response is substantive and matches expected behavior", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "Here is yesterday's revenue breakdown: total $12,450, up 8% from last week. Top campaign: Search Brand.",
      toolCalls: [],
      skillsActivated: ["reporting"],
      errors: [],
      totalDurationMs: 300,
    });

    const result = await runSkillTest(
      {
        id: "skill-smoke-2",
        skillId: "reporting",
        skillName: "Reporting",
        testType: "smoke",
        input: "Show me yesterday's revenue",
        expectedBehavior: "Returns a revenue summary with amounts",
        timeout: 10_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-abc", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("pass");
    expect(mockCollectExecutionTrace).toHaveBeenCalledTimes(1);
    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
  });

  test("skips when test needsConfig and missingEnv is set", async () => {
    const { runSkillTest } = await import("./skill-test-runner");

    const result = await runSkillTest(
      {
        id: "skill-config-1",
        skillId: "ads",
        skillName: "Ads",
        testType: "smoke",
        input: "Get campaign performance",
        expectedBehavior: "Returns performance data",
        timeout: 10_000,
        needsConfig: true,
        missingEnv: ["GOOGLE_ADS_TOKEN"],
      },
      { sandboxId: "sandbox-abc", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("skip");
    expect(result.reason).toContain("GOOGLE_ADS_TOKEN");
    expect(mockCollectExecutionTrace).not.toHaveBeenCalled();
  });

  test("fails when response contains an error pattern", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "Internal Server Error: Cannot read properties of undefined",
      toolCalls: [],
      skillsActivated: [],
      errors: ["crash"],
      totalDurationMs: 50,
    });

    const result = await runSkillTest(
      {
        id: "skill-error-1",
        skillId: "reporting",
        skillName: "Reporting",
        testType: "smoke",
        input: "Crash",
        expectedBehavior: "Should not crash",
        timeout: 10_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-abc", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("fail");
  });

  test("returns timeout status when execution throws AbortError", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    const abortErr = new Error("timeout exceeded");
    abortErr.name = "AbortError";
    mockCollectExecutionTrace.mockRejectedValueOnce(abortErr);

    const result = await runSkillTest(
      {
        id: "skill-timeout-1",
        skillId: "slow",
        skillName: "Slow",
        testType: "smoke",
        input: "Do slow thing",
        expectedBehavior: "Responds",
        timeout: 1_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-abc", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("timeout");
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

describe("runAllSkillTests", () => {
  beforeEach(() => {
    mockCollectExecutionTrace.mockReset();
    mockSendToArchitectStreaming.mockReset();
  });

  test("runs all tests and returns results array", async () => {
    const { runAllSkillTests } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValue({
      response: "Here is a detailed summary with revenue data for yesterday: $10,000 total revenue from Search campaigns.",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    });

    const tests = [
      { id: "t1", skillId: "s1", skillName: "S1", testType: "smoke" as const, input: "q1", expectedBehavior: "summary with revenue data", timeout: 5000, needsConfig: false },
      { id: "t2", skillId: "s2", skillName: "S2", testType: "smoke" as const, input: "q2", expectedBehavior: "summary with revenue data", timeout: 5000, needsConfig: false },
    ];

    const results = await runAllSkillTests(tests, { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] });
    expect(results).toHaveLength(2);
  });

  test("calls onProgress after each test", async () => {
    const { runAllSkillTests } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValue({
      response: "A detailed response with enough content to pass the 100-char threshold for smoke test heuristics.",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    });

    const progressCalls: [number, number][] = [];
    const tests = [
      { id: "t1", skillId: "s1", skillName: "S1", testType: "smoke" as const, input: "q1", expectedBehavior: "response", timeout: 5000, needsConfig: false },
    ];

    await runAllSkillTests(tests, { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] }, (result, i, total) => {
      progressCalls.push([i, total]);
    });

    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]).toEqual([0, 1]);
  });

  test("all tests skip when sandboxId is null", async () => {
    const { runAllSkillTests } = await import("./skill-test-runner");

    const tests = [
      { id: "t1", skillId: "s1", skillName: "S1", testType: "smoke" as const, input: "q1", expectedBehavior: "r", timeout: 5000, needsConfig: false },
      { id: "t2", skillId: "s2", skillName: "S2", testType: "smoke" as const, input: "q2", expectedBehavior: "r", timeout: 5000, needsConfig: false },
    ];

    const results = await runAllSkillTests(tests, { sandboxId: null, sessionId: "s-1", skillGraph: [] });
    expect(results.every((r) => r.status === "skip")).toBe(true);
    expect(mockCollectExecutionTrace).not.toHaveBeenCalled();
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

describe("runSkillTest — evaluateSmokeTestResult edge cases", () => {
  beforeEach(() => {
    mockCollectExecutionTrace.mockReset();
    mockSendToArchitectStreaming.mockReset();
  });

  test("fails when response is too short (under 50 chars)", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "Short",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 50,
    });

    const result = await runSkillTest(
      {
        id: "short-1",
        skillId: "reporting",
        skillName: "Reporting",
        testType: "smoke",
        input: "Get data",
        expectedBehavior: "Returns data",
        timeout: 10_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("fail");
    expect(result.reason).toContain("too short");
  });

  test("passes when response is a refusal and needsConfig is true", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "I cannot help with that — this requires configuration that hasn't been set up yet. Please configure the Google Ads integration first.",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    });

    const result = await runSkillTest(
      {
        id: "refusal-config-1",
        skillId: "google-ads",
        skillName: "Google Ads",
        testType: "smoke",
        input: "Get campaign performance",
        expectedBehavior: "Returns campaign data",
        timeout: 10_000,
        needsConfig: true,
      },
      { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("pass");
    expect(result.reason).toContain("missing configuration");
  });

  test("fails when response is a refusal and needsConfig is false", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "I'm not able to help with that request. This is outside my capabilities as configured.",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    });

    const result = await runSkillTest(
      {
        id: "refusal-no-config-1",
        skillId: "google-ads",
        skillName: "Google Ads",
        testType: "smoke",
        input: "Get campaign performance",
        expectedBehavior: "Returns campaign data",
        timeout: 10_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("fail");
    expect(result.reason).toContain("refused");
  });

  test("passes with substantive response (100+ chars) even without keyword match", async () => {
    const { runSkillTest } = await import("./skill-test-runner");
    mockCollectExecutionTrace.mockResolvedValueOnce({
      response: "Here is a very detailed and comprehensive response that contains a lot of useful information about completely unrelated topics but is definitely substantive and long enough to pass the smoke test threshold.",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    });

    const result = await runSkillTest(
      {
        id: "substantive-1",
        skillId: "reporting",
        skillName: "Reporting",
        testType: "smoke",
        input: "Get data",
        expectedBehavior: "Returns zygomorphic morphological data",
        timeout: 10_000,
        needsConfig: false,
      },
      { sandboxId: "sandbox-1", sessionId: "s-1", skillGraph: [] },
    );

    expect(result.status).toBe("pass");
    expect(result.reason).toContain("substantive");
  });
});
