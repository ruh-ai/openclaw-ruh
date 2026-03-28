import { afterEach, describe, expect, mock, test } from "bun:test";

import { BridgeApiError, sendToArchitectStreaming, sendToForgeSandboxChat } from "./api";

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

  test("surfaces structured approval events while continuing to parse the final result", async () => {
    const onStatus = mock();
    const onApprovalEvent = mock();

    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: approval_required\n",
        'data: {"approvalId":"approval-1","toolName":"apply_patch","message":"Approval required for apply_patch.","decision":"pending"}\n\n',
        "event: approval_denied\n",
        'data: {"approvalId":"approval-1","toolName":"apply_patch","message":"Denied apply_patch.","decision":"deny"}\n\n',
        "event: result\n",
        'data: {"type":"error","error":"approval_denied","content":"Denied apply_patch."}\n\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-approval", "Patch the repo", {
        onStatus,
        onApprovalEvent,
      })
    ).resolves.toEqual({
      type: "error",
      error: "approval_denied",
      content: "Denied apply_patch.",
    });

    expect(onApprovalEvent).toHaveBeenCalledTimes(2);
    expect(onApprovalEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
        decision: "pending",
      })
    );
    expect(onApprovalEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
        decision: "deny",
      })
    );
    expect(onStatus).toHaveBeenNthCalledWith(
      1,
      "approval_required",
      "Approval required for apply_patch."
    );
    expect(onStatus).toHaveBeenNthCalledWith(
      2,
      "approval_denied",
      "Denied apply_patch."
    );
  });

  test("forwards intermediate shared-bridge events to the streaming callback", async () => {
    const onIntermediate = mock();

    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: intermediate\n",
        'data: {"kind":"identity","name":"Google Ads Optimizer","description":"Audits campaigns"}\n\n',
        "event: intermediate\n",
        'data: {"kind":"tool_hint","toolId":"google-ads"}\n\n',
        "event: result\n",
        'data: {"type":"agent_response","content":"Ready for review"}\n\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-intermediate", "Build an agent", { onIntermediate })
    ).resolves.toEqual({
      type: "agent_response",
      content: "Ready for review",
    });

    expect(onIntermediate).toHaveBeenCalledTimes(2);
    expect(onIntermediate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "identity",
        name: "Google Ads Optimizer",
      })
    );
    expect(onIntermediate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "tool_hint",
        toolId: "google-ads",
      })
    );
  });

  test("forwards test mode and soul override to the bridge route", async () => {
    const controller = new AbortController();

    globalThis.fetch = mock(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(init?.body))).toEqual({
        session_id: "session-test",
        request_id: "req-123",
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
        requestId: "req-123",
        mode: "test",
        soulOverride: "# You are Review Agent",
        signal: controller.signal,
      })
    ).resolves.toEqual({
      type: "agent_response",
      content: "I can help with review testing.",
    });
  });

  test("surfaces structured bridge auth failures distinctly from gateway outages", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          error: "unauthorized",
          detail: "Missing access token.",
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      )
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-auth", "Build an agent")
    ).rejects.toEqual(
      expect.objectContaining<Partial<BridgeApiError>>({
        name: "BridgeApiError",
        status: 401,
        code: "unauthorized",
        isAuthError: true,
        message: "Bridge auth error: Missing access token.",
      })
    );
  });
});

describe("SSE timeout", () => {
  test("throws timeout error when read takes too long", async () => {
    const encoder = new TextEncoder();

    globalThis.fetch = mock(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            // Enqueue one chunk so the stream is open, but never close it
            controller.enqueue(encoder.encode("event: status\ndata: {\"phase\":\"planning\",\"message\":\"Thinking\"}\n\n"));
            // Never close — simulates a stalled connection
          },
        }),
        {
          headers: { "content-type": "text/event-stream" },
        }
      )
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-timeout", "Build an agent", undefined, {
        readTimeoutMs: 50,
      })
    ).rejects.toThrow("SSE read timed out after 50ms");
  });
});

describe("partial response fallback", () => {
  test("returns partial response when stream ends without result event but has deltas", async () => {
    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: delta\n",
        'data: {"text":"Hello "}\n\n',
        "event: delta\n",
        'data: {"text":"world"}\n\n',
      ])
    ) as typeof fetch;

    const result = await sendToArchitectStreaming("session-partial", "Build an agent");

    expect(result).toEqual({
      type: "agent_response",
      content: "Hello world",
    });
  });

  test("still throws when no result and no deltas", async () => {
    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: status\n",
        'data: {"phase":"planning","message":"Thinking"}\n\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToArchitectStreaming("session-no-result", "Build an agent")
    ).rejects.toThrow("SSE stream ended without a result event");
  });

  test("sendToForgeSandboxChat returns partial response from deltas when no result event", async () => {
    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: delta\n",
        'data: {"text":"Forge partial"}\n\n',
      ])
    ) as typeof fetch;

    const result = await sendToForgeSandboxChat("sandbox-1", "session-forge", "Test message");

    expect(result).toEqual({
      type: "agent_response",
      content: "Forge partial",
    });
  });

  test("sendToForgeSandboxChat throws when no result and no deltas", async () => {
    globalThis.fetch = mock(async () =>
      makeSseResponse([
        "event: status\n",
        'data: {"phase":"planning","message":"Thinking"}\n\n',
      ])
    ) as typeof fetch;

    await expect(
      sendToForgeSandboxChat("sandbox-1", "session-forge-err", "Test message")
    ).rejects.toThrow("Forge chat stream ended without a result event");
  });
});
