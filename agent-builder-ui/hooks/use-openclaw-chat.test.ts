import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockSendToArchitectStreaming = mock();
const mockSendToForgeSandboxChat = mock();

mock.module("@/lib/openclaw/api", () => ({
  sendToArchitectStreaming: mockSendToArchitectStreaming,
  sendToForgeSandboxChat: mockSendToForgeSandboxChat,
  BridgeApiError: class BridgeApiError extends Error { status: number; constructor(m: string, s = 0) { super(m); this.status = s; } },
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

// ─── sendMessage response types ───────────────────────────────────────────────

describe("sendMessage response type handling", () => {
  test("handles clarification response with string questions", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "clarification",
      questions: ["What industry?", "What is your budget?"],
      content: "I need more info.",
    });

    await useOpenClawChat.getState().sendMessage("Build me an agent");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.responseType).toBe("clarification");
    expect(last?.questions?.[0].id).toBe("q-0");
    expect(last?.questions?.[0].type).toBe("text");
    expect(last?.content).toContain("What industry?");
  });

  test("handles clarification response with object questions", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "clarification",
      questions: [
        { id: "q-custom", question: "What channel?", type: "select", options: ["Slack", "Email"], required: true },
      ],
      content: "",
    });

    await useOpenClawChat.getState().sendMessage("Configure agent");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.questions?.[0].id).toBe("q-custom");
    expect(last?.questions?.[0].type).toBe("select");
    expect(last?.questions?.[0].options).toEqual(["Slack", "Email"]);
  });

  test("handles ready_for_review with skill_graph and normalizes workflow", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      system_name: "google-ads-agent",
      skill_graph: {
        nodes: [
          { skill_id: "campaign-monitor", name: "Campaign Monitor", depends_on: [], description: "" },
          { skill_id: "bid-optimizer", name: "Bid Optimizer", depends_on: [], description: "" },
        ],
        workflow: null,
      },
      agent_metadata: {
        tone: "professional",
        schedule_description: "Daily at 9am",
        primary_users: "Marketing team",
      },
      requirements: {
        required_env_vars: ["GOOGLE_ADS_TOKEN"],
      },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const state = useOpenClawChat.getState();
    expect(state.skillGraph).toHaveLength(2);
    expect(state.systemName).toBe("google-ads-agent");
    expect(state.workflow?.steps).toHaveLength(2);
    expect(state.agentRules).toContain("Communicate in a professional tone");
    expect(state.agentRules).toContain("Schedule: Daily at 9am");
    expect(state.agentRules).toContain("Intended for: Marketing team");
    expect(state.agentRules).toContain("Requires env: GOOGLE_ADS_TOKEN");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toContain("2 skills");
  });

  test("handles ready_for_review with legacy string array workflow steps", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "step-one", name: "Step One", depends_on: [], description: "" },
          { skill_id: "step-two", name: "Step Two", depends_on: [], description: "" },
        ],
        workflow: { steps: ["step-one", "step-two"] },
      },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const state = useOpenClawChat.getState();
    expect(state.workflow?.steps[0].skill).toBe("step-one");
    expect(state.workflow?.steps[1].wait_for).toContain("step-one");
  });

  test("handles ready_for_review without skill_graph", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      content: "Plan ready. No graph yet.",
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toBe("Plan ready. No graph yet.");
  });

  test("handles agent_response type", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "agent_response",
      content: "Sure, I will add a Slack skill.",
    });

    await useOpenClawChat.getState().sendMessage("Add Slack");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toBe("Sure, I will add a Slack skill.");
  });

  test("handles unknown response type using content fallback", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "some_unknown_type",
      content: "Unknown type content",
    });

    await useOpenClawChat.getState().sendMessage("Ask something");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toBe("Unknown type content");
  });

  test("handles network error and rotates sessionId", async () => {
    const originalSessionId = useOpenClawChat.getState().sessionId;
    mockSendToArchitectStreaming.mockRejectedValueOnce(new Error("Connection refused"));

    await useOpenClawChat.getState().sendMessage("Ping");
    const state = useOpenClawChat.getState();
    expect(state.error).toBe("Connection refused");
    expect(state.sessionId).not.toBe(originalSessionId);
    expect(state.isLoading).toBe(false);
    const last = state.messages.at(-1);
    expect(last?.content).toContain("Connection refused");
  });

  test("ignores empty messages (trim check)", async () => {
    await useOpenClawChat.getState().sendMessage("   ");
    // sendToArchitectStreaming should not be called
    expect(mockSendToArchitectStreaming).not.toHaveBeenCalled();
  });
});

// ─── initialize action ────────────────────────────────────────────────────────

describe("initialize action", () => {
  test("sets context message with agent name and skills", () => {
    useOpenClawChat.getState().initialize({
      name: "Google Ads Agent",
      skillGraph: [{ skill_id: "campaign-monitor", name: "Campaign Monitor", depends_on: [], description: "", source: "custom", status: "built" }],
      agentRules: ["Be professional"],
    });

    const state = useOpenClawChat.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toContain("Google Ads Agent");
    expect(state.messages[0].content).toContain("Campaign Monitor");
    expect(state.agentRules).toEqual(["Be professional"]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  test("initializes with 'no skills yet' when no skillGraph", () => {
    useOpenClawChat.getState().initialize({ name: "Empty Agent" });
    expect(useOpenClawChat.getState().messages[0].content).toContain("no skills yet");
  });

  test("generates a fresh sessionId on initialize", () => {
    const beforeId = useOpenClawChat.getState().sessionId;
    useOpenClawChat.getState().initialize({ name: "Test" });
    expect(useOpenClawChat.getState().sessionId).not.toBe(beforeId);
  });
});

// ─── normalizeWorkflow via ready_for_review ───────────────────────────────────

describe("normalizeWorkflow — system name inference", () => {
  test("infers systemName from skill_graph nodes when system_name is absent", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "google-ads-fetch-skill", name: "Fetch", depends_on: [], description: "" },
        ],
        workflow: null,
        system_name: undefined,
      },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    // systemName should be inferred from the first node's skill_id
    expect(useOpenClawChat.getState().systemName).toBe("google-ads-fetch");
  });

  test("workflow steps link correctly via wait_for when built from null workflow", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "s1", name: "S1", depends_on: [], description: "" },
          { skill_id: "s2", name: "S2", depends_on: [], description: "" },
          { skill_id: "s3", name: "S3", depends_on: [], description: "" },
        ],
        workflow: null,
      },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const steps = useOpenClawChat.getState().workflow?.steps ?? [];
    expect(steps[0].wait_for).toEqual([]);
    expect(steps[1].wait_for).toEqual(["s1"]);
    expect(steps[2].wait_for).toEqual(["s2"]);
  });

  test("uses cron_expression rule when schedule_description absent", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      skill_graph: {
        nodes: [{ skill_id: "s1", name: "S1", depends_on: [], description: "" }],
        workflow: null,
      },
      agent_metadata: { cron_expression: "0 9 * * 1-5" },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    expect(useOpenClawChat.getState().agentRules).toContain("Runs on cron: 0 9 * * 1-5");
  });

  test("uses requirements.schedule when no agent_metadata schedule info", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      skill_graph: {
        nodes: [{ skill_id: "s1", name: "S1", depends_on: [], description: "" }],
        workflow: null,
      },
      requirements: { schedule: "weekly on Monday", required_env_vars: [] },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    expect(useOpenClawChat.getState().agentRules).toContain("Schedule: weekly on Monday");
  });

  test("passes through a well-formed WorkflowDefinition unchanged", async () => {
    const existingWorkflow = {
      name: "my-workflow",
      description: "Custom workflow",
      steps: [
        { id: "step-0", action: "execute", skill: "s1", wait_for: [] },
        { id: "step-1", action: "execute", skill: "s2", wait_for: ["s1"] },
      ],
    };
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "ready_for_review",
      system_name: "my-agent",
      skill_graph: {
        nodes: [
          { skill_id: "s1", name: "S1", depends_on: [], description: "" },
          { skill_id: "s2", name: "S2", depends_on: [], description: "" },
        ],
        workflow: existingWorkflow,
      },
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const workflow = useOpenClawChat.getState().workflow;
    // Workflow with proper WorkflowStep objects should pass through unchanged
    expect(workflow?.name).toBe("my-workflow");
    expect(workflow?.steps).toHaveLength(2);
    expect(workflow?.steps[0].skill).toBe("s1");
  });

  test("handles error response with no content or error fields", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "error",
    });

    await useOpenClawChat.getState().sendMessage("Build");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toContain("Something went wrong");
  });

  test("handles unknown response type using message fallback", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "some_unknown_type",
      message: "A message field instead of content",
    });

    await useOpenClawChat.getState().sendMessage("Ask something");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toBe("A message field instead of content");
  });

  test("handles unknown response type using context fallback", async () => {
    mockSendToArchitectStreaming.mockResolvedValueOnce({
      type: "some_unknown_type",
      context: "Context field content",
    });

    await useOpenClawChat.getState().sendMessage("Ask something");
    const last = useOpenClawChat.getState().messages.at(-1);
    expect(last?.content).toBe("Context field content");
  });
});
