/**
 * Unit tests for eval-reflector.ts
 *
 * Tests failure diagnosis and skill rewrite proposal parsing.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { EvalTask, SkillGraphNode } from "../types";

const mockSendToArchitectStreaming = mock(() =>
  Promise.resolve({ type: "agent_response" as const, content: "" }),
);

mock.module("../api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

const SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "fetch-inventory",
    name: "Fetch Inventory",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Fetches inventory from Shopify",
    skill_md: "---\nname: fetch-inventory\n---\n# Fetch Inventory\n## Process\n1. Call Shopify API\n2. Return results",
  },
];

describe("eval-reflector", () => {
  beforeEach(() => {
    mockSendToArchitectStreaming.mockReset();
  });

  test("parses valid rewrite proposals", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: JSON.stringify([
        {
          skillId: "fetch-inventory",
          newContent: "---\nname: fetch-inventory\n---\n# Fetch Inventory\n## Process\n1. Call Shopify API with pagination\n2. Aggregate all pages\n3. Return results",
          rationale: "Added pagination support to handle large inventories",
        },
      ]),
    });

    const { reflectOnFailures } = await import("../eval-reflector");

    const failedTasks: EvalTask[] = [
      {
        id: "eval-1",
        title: "Fetch large inventory",
        input: "Get all inventory items",
        expectedBehavior: "Fetch all items including paginated results",
        status: "fail",
        response: "Here are the first 50 items...",
        traceScore: {
          passed: false,
          score: 0.4,
          feedback: "Only returned first page",
          skillDiagnosis: [{ skillId: "fetch-inventory", verdict: "partial", issue: "Missing pagination" }],
          suggestedFixes: ["Add pagination loop"],
        },
      },
    ];

    const result = await reflectOnFailures(failedTasks, SKILL_GRAPH, "test-session");

    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0].skillId).toBe("fetch-inventory");
    expect(result.rewrites[0].newContent).toContain("pagination");
    expect(result.rewrites[0].rationale).toContain("pagination");
    expect(result.summary).toContain("1 skill rewrite");
  });

  test("returns empty rewrites when LLM returns empty array", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "[]",
    });

    const { reflectOnFailures } = await import("../eval-reflector");

    const result = await reflectOnFailures(
      [{ id: "1", title: "t", input: "i", expectedBehavior: "e", status: "fail" }],
      SKILL_GRAPH,
      "test-session",
    );

    expect(result.rewrites).toHaveLength(0);
    expect(result.summary).toContain("No skill changes");
  });

  test("returns empty rewrites when no failed tasks", async () => {
    const { reflectOnFailures } = await import("../eval-reflector");

    const result = await reflectOnFailures([], SKILL_GRAPH, "test-session");

    expect(result.rewrites).toHaveLength(0);
    expect(result.summary).toContain("No failures");
    // Should not call the LLM at all
    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
  });

  test("handles LLM error gracefully", async () => {
    mockSendToArchitectStreaming.mockRejectedValueOnce(new Error("Timeout"));

    const { reflectOnFailures } = await import("../eval-reflector");

    const result = await reflectOnFailures(
      [{ id: "1", title: "t", input: "i", expectedBehavior: "e", status: "fail" }],
      SKILL_GRAPH,
      "test-session",
    );

    expect(result.rewrites).toHaveLength(0);
    expect(result.summary).toContain("Reflection failed");
  });

  test("filters out rewrites with missing fields", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: JSON.stringify([
        { skillId: "fetch-inventory", newContent: "valid content", rationale: "good" },
        { skillId: "missing-content" },
        { newContent: "no skill id", rationale: "bad" },
      ]),
    });

    const { reflectOnFailures } = await import("../eval-reflector");

    const result = await reflectOnFailures(
      [{ id: "1", title: "t", input: "i", expectedBehavior: "e", status: "fail" }],
      SKILL_GRAPH,
      "test-session",
    );

    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0].skillId).toBe("fetch-inventory");
  });
});
