import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventType } from "@ag-ui/core";

const mockFetch = mock();

const encoder = new TextEncoder();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as typeof fetch;
});

function makeSseResponse(lines: string[]) {
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const { SandboxAgent } = await import("../sandbox-agent");

describe("SandboxAgent", () => {
  test("emits a run error when the backend reports a persistence_error event", async () => {
    mockFetch.mockResolvedValue(makeSseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'event: persistence_error\n',
      'data: {"code":"chat_exchange_persistence_failed","message":"Reply could not be saved."}\n\n',
      'data: [DONE]\n\n',
    ]));

    const agent = new SandboxAgent({ sandboxId: "sandbox-1", apiBase: "http://localhost:8000" });
    const events: Array<Record<string, unknown>> = [];

    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-1",
        messages: [{ id: "msg-1", role: "user", content: "Hello" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: "conv-1",
          model: "openclaw",
        },
      }).subscribe({
        next: (event) => {
          events.push(event as Record<string, unknown>);
        },
        error: reject,
        complete: () => {
          subscription.unsubscribe();
          resolve();
        },
      });
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: "Reply could not be saved.",
    }));
  });

  test("closes native OpenAI tool calls exactly once before the final stop chunk", async () => {
    mockFetch.mockResolvedValue(makeSseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"browser_click","arguments":"{\\"selector\\":\\"button\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Clicked the primary action."}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]));

    const agent = new SandboxAgent({ sandboxId: "sandbox-1", apiBase: "http://localhost:8000" });
    const events: Array<Record<string, unknown>> = [];

    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-1",
        messages: [{ id: "msg-1", role: "user", content: "Click the CTA" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: "conv-1",
          model: "openclaw",
        },
      }).subscribe({
        next: (event) => {
          events.push(event as Record<string, unknown>);
        },
        error: reject,
        complete: () => {
          subscription.unsubscribe();
          resolve();
        },
      });
    });

    const toolEndEvents = events.filter(
      (event) => event.type === EventType.TOOL_CALL_END && event.toolCallId === "tool-0",
    );

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TOOL_CALL_START,
      toolCallId: "tool-0",
      toolCallName: "browser_click",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "tool-0",
      delta: '{"selector":"button"}',
    }));
    expect(toolEndEvents).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "Clicked the primary action.",
    }));
  });

  test("emits editor file change metadata for structured code-tool start payloads", async () => {
    mockFetch.mockResolvedValue(makeSseResponse([
      'event: tool_start\n',
      'data: {"tool":"write_file","input":{"path":"src/app.ts","content":"console.log(\\"hi\\")"}}\n\n',
      'event: tool_end\n',
      'data: {"ok":true}\n\n',
      'event: result\n',
      'data: {"content":"Updated src/app.ts."}\n\n',
      'data: [DONE]\n\n',
    ]));

    const agent = new SandboxAgent({ sandboxId: "sandbox-1", apiBase: "http://localhost:8000" });
    const events: Array<Record<string, unknown>> = [];

    await new Promise<void>((resolve, reject) => {
      const subscription = agent.run({
        threadId: "thread-1",
        runId: "run-1",
        messages: [{ id: "msg-1", role: "user", content: "Update the app entrypoint" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          conversationId: "conv-1",
          model: "openclaw",
        },
      }).subscribe({
        next: (event) => {
          events.push(event as Record<string, unknown>);
        },
        error: reject,
        complete: () => {
          subscription.unsubscribe();
          resolve();
        },
      });
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.CUSTOM,
      name: "editor_file_changed",
      value: { path: "src/app.ts" },
    }));
  });
});
