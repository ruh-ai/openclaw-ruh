import { afterEach, describe, expect, mock, test } from "bun:test";

import { sendToArchitectStreaming } from "./api";

const originalFetch = globalThis.fetch;

function makeSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    }
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("sendToArchitectStreaming", () => {
  test("returns a direct JSON architect response without using the SSE parser", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          type: "ready_for_review",
          content: "Structured response",
          skill_graph: [],
          workflow: [],
        }),
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      )
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-json", "Build an agent")
    ).resolves.toEqual({
      type: "ready_for_review",
      content: "Structured response",
      skill_graph: [],
      workflow: [],
    });
  });

  test("returns the final architect result when the SSE stream ends without a trailing blank line", async () => {
    const onStatus = mock();

    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: status\n",
        'data: {"phase":"planning","message":"Thinking"}\n\n',
        "event: re",
        "sult\n",
        'data: {"type":"agent_response","content":"Ready for review"}',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-123", "Build an agent", { onStatus })
    ).resolves.toEqual({
      type: "agent_response",
      content: "Ready for review",
    });

    expect(onStatus).toHaveBeenCalledWith("planning", "Thinking");
  });

  test("parses fragmented SSE status and result events split across chunk boundaries", async () => {
    const onStatus = mock();

    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: st",
        "atus\n",
        'data: {"phase":"planning","mess',
        'age":"Thinking"}\n\n',
        "event: res",
        "ult\n",
        'data: {"type":"agent_response","cont',
        'ent":"Ready for review"}\n\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-456", "Plan the agent", { onStatus })
    ).resolves.toEqual({
      type: "agent_response",
      content: "Ready for review",
    });

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("planning", "Thinking");
  });

  test("reconstructs a JSON result split across multiple SSE data lines", async () => {
    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: result\n",
        "data: {\n",
        'data:   "type": "agent_response",\n',
        'data:   "content": "Ready for review"\n',
        "data: }\n\n",
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-multiline", "Build an agent")
    ).resolves.toEqual({
      type: "agent_response",
      content: "Ready for review",
    });
  });

  test("parses CRLF-delimited SSE streams with multiple events", async () => {
    const onStatus = mock();

    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: status\r\n",
        'data: {"phase":"planning","message":"Thinking"}\r\n\r\n',
        "event: result\r\n",
        'data: {"type":"agent_response","content":"Ready for review"}\r\n\r\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-crlf", "Build an agent", { onStatus })
    ).resolves.toEqual({
      type: "agent_response",
      content: "Ready for review",
    });

    expect(onStatus).toHaveBeenCalledWith("planning", "Thinking");
  });

  test("forwards test mode and soul override to the bridge route", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({
        session_id: "session-test",
        message: "What can you do?",
        agent: "architect",
        mode: "test",
        soul_override: "# You are Review Agent",
      });

      return new Response(
        JSON.stringify({
          type: "agent_response",
          content: "I can help with review testing.",
        }),
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    }) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-test", "What can you do?", undefined, {
        mode: "test",
        soulOverride: "# You are Review Agent",
      })
    ).resolves.toEqual({
      type: "agent_response",
      content: "I can help with review testing.",
    });
  });
});
