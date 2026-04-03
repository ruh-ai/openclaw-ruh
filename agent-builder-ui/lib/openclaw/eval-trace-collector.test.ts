import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import type { SkillGraphNode } from "./types";

const originalFetch = globalThis.fetch;

const SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "campaign-perf",
    name: "Campaign Performance",
    source: "custom",
    status: "approved",
    depends_on: [],
  },
  {
    skill_id: "budget-mgr",
    name: "Budget Manager",
    source: "custom",
    status: "approved",
    depends_on: [],
  },
];

describe("eval-trace-collector", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response("", { status: 200 })));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends POST to forge-chat-traced endpoint", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: result\ndata: {"content":"Hello from agent"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test message",
      skillGraph: SKILL_GRAPH,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/openclaw/forge-chat-traced");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.sandbox_id).toBe("sandbox-1");
    expect(body.session_id).toBe("session-1");
    expect(body.message).toBe("test message");
  });

  test("captures response from result event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: result\ndata: {"content":"Agent response text"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.response).toBe("Agent response text");
    expect(trace.errors).toHaveLength(0);
  });

  test("captures tool start and end events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: tool_start\ndata: {"tool":"curl","input":"GET /api/data"}\n\n'),
        );
        controller.enqueue(
          encoder.encode('event: tool_end\ndata: {"result":"200 OK"}\n\n'),
        );
        controller.enqueue(
          encoder.encode('event: result\ndata: {"content":"Done"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "fetch data",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0].toolName).toBe("curl");
    expect(trace.toolCalls[0].input).toBe("GET /api/data");
    expect(trace.toolCalls[0].output).toBe("200 OK");
  });

  test("detects activated skills from response text", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: result\ndata: {"content":"Using Campaign Performance to fetch metrics"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "get campaign data",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.skillsActivated).toContain("campaign-perf");
  });

  test("records errors from status events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: status\ndata: {"phase":"error","message":"Container timeout"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.errors).toContain("Container timeout");
  });

  test("records error when fetch returns non-200", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.errors.length).toBeGreaterThan(0);
    expect(trace.errors[0]).toContain("500");
  });

  test("records error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: SKILL_GRAPH,
    });

    expect(trace.errors).toContain("Network failure");
  });

  test("includes totalDurationMs in result", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: result\ndata: {"content":"ok"}\n\n'),
        );
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: [],
    });

    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test("accumulates delta events into response", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Hello "}\n\n'));
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"world"}\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const { collectExecutionTrace } = await import("./eval-trace-collector");

    const trace = await collectExecutionTrace({
      sandboxId: "sandbox-1",
      sessionId: "session-1",
      message: "test",
      skillGraph: [],
    });

    expect(trace.response).toBe("Hello world");
  });
});
