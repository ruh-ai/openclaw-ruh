/**
 * Unit tests for eval-trace-scorer.ts
 *
 * Tests the LLM judge prompt construction and response parsing.
 * Mocks `sendToArchitectStreaming` to avoid real LLM calls.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { ExecutionTrace, SkillGraphNode } from "../types";

// Mock the API module
const mockSendToArchitectStreaming = mock(() =>
  Promise.resolve({ type: "agent_response" as const, content: "" }),
);

mock.module("../api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

const SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "fetch-data",
    name: "Fetch Data",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Fetches data from an API",
  },
  {
    skill_id: "format-report",
    name: "Format Report",
    source: "custom",
    status: "approved",
    depends_on: ["fetch-data"],
    description: "Formats data into a report",
  },
];

describe("eval-trace-scorer", () => {
  beforeEach(() => {
    mockSendToArchitectStreaming.mockReset();
  });

  test("parses a valid JSON judge response", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: JSON.stringify({
        passed: true,
        score: 0.85,
        feedback: "Agent correctly fetched data and formatted the report.",
        skillDiagnosis: [
          { skillId: "fetch-data", verdict: "working" },
          { skillId: "format-report", verdict: "working" },
        ],
        suggestedFixes: [],
      }),
    });

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = {
      response: "Here is your formatted report with the latest data.",
      toolCalls: [{ toolName: "curl", input: "GET /api/data", output: '{"items":[]}', durationMs: 500 }],
      skillsActivated: ["fetch-data", "format-report"],
      errors: [],
      totalDurationMs: 2000,
    };

    const score = await scoreExecutionTrace(
      trace,
      "Agent should fetch data and format a report",
      SKILL_GRAPH,
      "test-session",
    );

    expect(score.passed).toBe(true);
    expect(score.score).toBe(0.85);
    expect(score.feedback).toContain("correctly");
    expect(score.skillDiagnosis).toHaveLength(2);
    expect(score.skillDiagnosis[0].verdict).toBe("working");
  });

  test("parses JSON wrapped in markdown code block", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "Here is my evaluation:\n```json\n" + JSON.stringify({
        passed: false,
        score: 0.2,
        feedback: "Agent failed to fetch data.",
        skillDiagnosis: [{ skillId: "fetch-data", verdict: "broken", issue: "API call not made" }],
        suggestedFixes: ["Add error handling for API calls"],
      }) + "\n```",
    });

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = {
      response: "I couldn't get the data.",
      toolCalls: [],
      skillsActivated: [],
      errors: ["Connection timeout"],
      totalDurationMs: 5000,
    };

    const score = await scoreExecutionTrace(trace, "Fetch data", SKILL_GRAPH, "test-session");

    expect(score.passed).toBe(false);
    expect(score.score).toBe(0.2);
    expect(score.skillDiagnosis[0].verdict).toBe("broken");
  });

  test("returns fallback score when LLM response is unparseable", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "I can't evaluate this trace properly. The response is ambiguous.",
    });

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = {
      response: "Some response",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 1000,
    };

    const score = await scoreExecutionTrace(trace, "Do something", SKILL_GRAPH, "test-session");

    expect(score.passed).toBe(false);
    expect(score.score).toBe(0.3);
    expect(score.feedback).toContain("could not be parsed");
  });

  test("returns fallback score when LLM call throws", async () => {
    mockSendToArchitectStreaming.mockRejectedValueOnce(new Error("Network error"));

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = {
      response: "Some response",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 1000,
    };

    const score = await scoreExecutionTrace(trace, "Do something", SKILL_GRAPH, "test-session");

    expect(score.passed).toBe(false);
    expect(score.score).toBe(0.3);
    expect(score.feedback).toContain("Scoring failed");
  });

  test("clamps score to 0-1 range", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: JSON.stringify({
        passed: true,
        score: 1.5,
        feedback: "Great",
        skillDiagnosis: [],
        suggestedFixes: [],
      }),
    });

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = {
      response: "Done",
      toolCalls: [],
      skillsActivated: [],
      errors: [],
      totalDurationMs: 100,
    };

    const score = await scoreExecutionTrace(trace, "Do it", SKILL_GRAPH, "test-session");
    expect(score.score).toBeLessThanOrEqual(1);
  });

  test("normalizes verdict strings", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: JSON.stringify({
        passed: false,
        score: 0.4,
        feedback: "Partial",
        skillDiagnosis: [
          { skillId: "fetch-data", verdict: "WORKING" },
          { skillId: "format-report", verdict: "invalid_value" },
        ],
        suggestedFixes: [],
      }),
    });

    const { scoreExecutionTrace } = await import("../eval-trace-scorer");

    const trace: ExecutionTrace = { response: "x", toolCalls: [], skillsActivated: [], errors: [], totalDurationMs: 0 };
    const score = await scoreExecutionTrace(trace, "Do it", SKILL_GRAPH, "test-session");

    // Invalid verdict should fall back to "unused"
    expect(score.skillDiagnosis[1].verdict).toBe("unused");
  });
});
