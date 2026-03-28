import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockSendToArchitectStreaming = mock();

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
}));

const { useOpenClawChat } = await import("./use-openclaw-chat");

beforeEach(() => {
  useOpenClawChat.getState().reset();
  mockSendToArchitectStreaming.mockReset();
});

afterEach(() => {
  useOpenClawChat.getState().reset();
});

describe("useOpenClawChat abort handling", () => {
  test("reset aborts the in-flight architect request and avoids appending a stale error", async () => {
    let observedSignal: AbortSignal | undefined;

    mockSendToArchitectStreaming.mockImplementation(
      async (
        _sessionId: string,
        _message: string,
        _callbacks?: unknown,
        options?: { signal?: AbortSignal; requestId?: string }
      ) => {
        observedSignal = options?.signal;

        return await new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
    );

    const sendPromise = useOpenClawChat.getState().sendMessage("Build a Google Ads agent");
    useOpenClawChat.getState().reset();

    await sendPromise;

    expect(mockSendToArchitectStreaming).toHaveBeenCalledTimes(1);
    expect(observedSignal?.aborted).toBe(true);
    expect(useOpenClawChat.getState().isLoading).toBe(false);
    expect(useOpenClawChat.getState().error).toBeNull();
    expect(useOpenClawChat.getState().messages).toHaveLength(1);
    expect(useOpenClawChat.getState().messages[0]?.content).toContain("Tell me what you'd like your agent to do");
  });

  test("ignores stale callbacks and a late response from a superseded request", async () => {
    let firstResolve: ((value: Record<string, unknown>) => void) | null = null;
    let firstCallbacks:
      | {
        onStatus?: (_phase: string, message: string) => void;
        onApprovalEvent?: (event: Record<string, unknown>) => void;
      }
      | undefined;

    mockSendToArchitectStreaming.mockImplementationOnce(
      async (
        _sessionId: string,
        _message: string,
        callbacks?: {
          onStatus?: (_phase: string, message: string) => void;
          onApprovalEvent?: (event: Record<string, unknown>) => void;
        }
      ) => {
        firstCallbacks = callbacks;

        return await new Promise<Record<string, unknown>>((resolve) => {
          firstResolve = resolve;
        });
      }
    );

    mockSendToArchitectStreaming.mockImplementationOnce(async () => ({
      type: "agent_response",
      content: "Fresh response",
    }));

    const firstPromise = useOpenClawChat.getState().sendMessage("First request");
    await Promise.resolve();

    await useOpenClawChat.getState().sendMessage("Second request");

    firstCallbacks?.onStatus?.("thinking", "Stale status");
    firstCallbacks?.onApprovalEvent?.({
      approvalId: "approval-stale",
      toolName: "apply_patch",
      decision: "pending",
      message: "Should be ignored.",
    });

    firstResolve?.({
      type: "agent_response",
      content: "Stale response",
    });
    await firstPromise;

    const state = useOpenClawChat.getState();
    expect(state.approvalEvents).toEqual([]);
    expect(state.statusMessage).toBe("");
    expect(state.messages.map((message) => message.content)).toEqual([
      expect.stringContaining("Tell me what you'd like your agent to do"),
      "First request",
      "Second request",
      "Fresh response",
    ]);
  });

  test("records approval events from the bridge and keeps the final denial visible in chat state", async () => {
    mockSendToArchitectStreaming.mockImplementation(
      async (
        _sessionId: string,
        _message: string,
        callbacks?: {
          onApprovalEvent?: (event: Record<string, unknown>) => void;
        }
      ) => {
        callbacks?.onApprovalEvent?.({
          approvalId: "approval-1",
          toolName: "apply_patch",
          decision: "pending",
          message: "Approval required for apply_patch.",
        });
        callbacks?.onApprovalEvent?.({
          approvalId: "approval-1",
          toolName: "apply_patch",
          decision: "deny",
          message: "Denied apply_patch.",
        });

        return {
          type: "error",
          error: "approval_denied",
          content: "Denied apply_patch.",
        };
      }
    );

    await useOpenClawChat.getState().sendMessage("Patch the repo");

    expect(useOpenClawChat.getState().approvalEvents).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
        decision: "pending",
      }),
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
        decision: "deny",
      }),
    ]);
    expect(useOpenClawChat.getState().messages.at(-1)?.content).toContain(
      "Denied apply_patch."
    );
    expect(useOpenClawChat.getState().error).toBe("approval_denied");
  });
});
