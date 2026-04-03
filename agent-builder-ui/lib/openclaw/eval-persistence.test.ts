import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { saveEvalResults, loadEvalResults, loadEvalResult } from "./eval-persistence";
import type { EvalTask } from "./types";

const originalFetch = globalThis.fetch;

describe("eval-persistence", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "eval-1" }), { status: 200 })),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("saveEvalResults", () => {
    const tasks: EvalTask[] = [
      { id: "t1", title: "Test 1", input: "input1", expectedBehavior: "expected1", status: "pass", confidence: 0.9 },
      { id: "t2", title: "Test 2", input: "input2", expectedBehavior: "expected2", status: "fail", confidence: 0.3 },
      { id: "t3", title: "Test 3", input: "input3", expectedBehavior: "expected3", status: "pass", confidence: 0.8 },
    ];

    test("sends POST with correct agent ID in URL", async () => {
      await saveEvalResults("agent-abc", { mode: "mock", tasks });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/agents/agent-abc/eval-results");
    });

    test("calculates pass/fail/total stats correctly", async () => {
      await saveEvalResults("agent-abc", { mode: "mock", tasks });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.total_tasks).toBe(3);
      expect(body.passed_tasks).toBe(2);
      expect(body.failed_tasks).toBe(1);
      expect(body.pass_rate).toBeCloseTo(2 / 3);
    });

    test("calculates average score", async () => {
      await saveEvalResults("agent-abc", { mode: "mock", tasks });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.avg_score).toBeCloseTo((0.9 + 0.3 + 0.8) / 3);
    });

    test("handles empty tasks array", async () => {
      await saveEvalResults("agent-abc", { mode: "mock", tasks: [] });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.total_tasks).toBe(0);
      expect(body.pass_rate).toBe(0);
      expect(body.avg_score).toBe(0);
    });

    test("includes sandbox_id and loop_state when provided", async () => {
      await saveEvalResults("agent-abc", {
        mode: "real",
        tasks,
        sandboxId: "sandbox-1",
        loopState: { iteration: 3, maxIterations: 5, scores: [], mutations: [], status: "completed", stopReason: "all_passed" },
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.sandbox_id).toBe("sandbox-1");
      expect(body.loop_state.iteration).toBe(3);
      expect(body.iterations).toBe(3);
      expect(body.stop_reason).toBe("all_passed");
    });

    test("throws when response is not ok", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));

      await expect(saveEvalResults("agent-abc", { mode: "mock", tasks })).rejects.toThrow(
        "Failed to save eval results: 500",
      );
    });
  });

  describe("loadEvalResults", () => {
    test("sends GET with correct agent ID", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
      );

      await loadEvalResults("agent-xyz");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/agents/agent-xyz/eval-results");
    });

    test("passes limit and offset as query params", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
      );

      await loadEvalResults("agent-xyz", { limit: 10, offset: 20 });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });

    test("throws when response is not ok", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 404 }));

      await expect(loadEvalResults("agent-xyz")).rejects.toThrow("Failed to load eval results: 404");
    });
  });

  describe("loadEvalResult", () => {
    test("sends GET with agent ID and eval ID", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "eval-1" }), { status: 200 }),
      );

      await loadEvalResult("agent-xyz", "eval-1");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/agents/agent-xyz/eval-results/eval-1");
    });

    test("throws when response is not ok", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 404 }));

      await expect(loadEvalResult("agent-xyz", "eval-1")).rejects.toThrow(
        "Failed to load eval result: 404",
      );
    });
  });
});
