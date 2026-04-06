import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type AttemptBehavior =
  | "pre_ack_fail"
  | "success"
  | "success_with_deltas"
  | "success_with_intermediate_hints"
  | "post_ack_close"
  | "approval_allowlisted"
  | "approval_denied"
  | "copilot_approval_write"
  | "copilot_approval_deploy";

const scenario = {
  attempts: [] as AttemptBehavior[],
  chatSendParams: [] as Array<Record<string, unknown>>,
  approvalResolutions: [] as Array<Record<string, unknown>>,
  finalMessage: "Finished",
  allowForgeHttpFallback: false,
  wsConstructed: 0,
  authStatus: 200,
  authFetches: [] as Array<{ url: string; authorization: string | null }>,
};

function extractResultEvent(body: string): Record<string, unknown> {
  const match = body.match(/event: result\s+data: (.+)/);
  if (!match) {
    throw new Error(`No result event found in body: ${body}`);
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function extractEventPayloads(
  body: string,
  eventName: string
): Array<Record<string, unknown>> {
  const matches = [...body.matchAll(new RegExp(`event: ${eventName}\\s+data: (.+)`, "g"))];
  return matches.map((match) => JSON.parse(match[1]) as Record<string, unknown>);
}

class MockWebSocket {
  private handlers = new Map<string, Array<(...args: any[]) => void>>();
  private activeApprovalBehavior: AttemptBehavior | null = null;

  constructor(_url: string, _options?: { headers?: Record<string, string> }) {
    scenario.wsConstructed += 1;
    queueMicrotask(() => {
      this.emit("message", Buffer.from(JSON.stringify({
        type: "event",
        event: "connect.challenge",
      })));
    });
  }

  on(event: string, handler: (...args: any[]) => void) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  send(data: string) {
    const message = JSON.parse(data) as Record<string, any>;

    if (message.method === "connect") {
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "res",
          id: "1",
          ok: true,
        })));
      });
      return;
    }

    if (message.method !== "chat.send") {
      if (message.method === "exec.approval.resolve") {
        scenario.approvalResolutions.push(message.params);

        if (this.activeApprovalBehavior === "approval_allowlisted") {
          queueMicrotask(() => {
            this.emit("message", Buffer.from(JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                state: "final",
                message: { content: scenario.finalMessage },
              },
            })));
          });
        }

        return;
      }
      return;
    }

    scenario.chatSendParams.push(message.params);

    const behavior = scenario.attempts.shift() ?? "success";
    if (behavior === "pre_ack_fail") {
      queueMicrotask(() => {
        this.emit("error", new Error("socket dropped before ack"));
      });
      return;
    }

    queueMicrotask(() => {
      this.emit("message", Buffer.from(JSON.stringify({
        type: "res",
        id: "2",
        ok: true,
        payload: { runId: "run-1" },
      })));
    });

    if (behavior === "post_ack_close") {
      queueMicrotask(() => {
        this.emit("close");
      });
      return;
    }

    if (
      behavior === "approval_allowlisted" ||
      behavior === "approval_denied"
    ) {
      this.activeApprovalBehavior = behavior;
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "exec.approval.requested",
          payload: {
            id: "approval-1",
            tool: behavior === "approval_allowlisted" ? "list_files" : "apply_patch",
            command: behavior === "approval_allowlisted" ? "ls src" : "apply_patch <<'PATCH'",
            justification:
              behavior === "approval_allowlisted"
                ? "Inspect the workspace before planning"
                : "Rewrite files directly in the workspace",
          },
        })));
      });
      return;
    }

    // Copilot approval test behaviors
    if (
      behavior === "copilot_approval_write" ||
      behavior === "copilot_approval_deploy"
    ) {
      this.activeApprovalBehavior = behavior === "copilot_approval_write" ? "approval_allowlisted" : "approval_denied";
      const toolName = behavior === "copilot_approval_write" ? "apply_patch" : "deploy_agent";
      const command = behavior === "copilot_approval_write"
        ? "apply_patch <<'PATCH'\n--- a/skill.md\n+++ b/skill.md"
        : "deploy --production";
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "exec.approval.requested",
          payload: {
            id: "approval-copilot",
            tool: toolName,
            command,
            justification: "Agent building operation",
          },
        })));
      });
      return;
    }

    // Delta streaming behavior: emit incremental agent text before final
    if (behavior === "success_with_deltas") {
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "agent",
          payload: {
            stream: "assistant",
            data: { text: "Hello " },
          },
        })));
      });
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "agent",
          payload: {
            stream: "assistant",
            data: { text: "Hello world" },
          },
        })));
      });
      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "agent",
          payload: {
            stream: "lifecycle",
            data: { phase: "end" },
          },
        })));
      });
      return;
    }

    if (behavior === "success_with_intermediate_hints") {
      const assistantFrames = [
        "I'll build Google Ads Optimizer for you.",
        "I'll build Google Ads Optimizer for you.\n\nCreating skills/google-ads-audit.md with the audit workflow.",
        "I'll build Google Ads Optimizer for you.\n\nCreating skills/google-ads-audit.md with the audit workflow.\n\nWe'll connect Google Ads and run it on a schedule.",
        "I'll build Google Ads Optimizer for you.\n\nCreating skills/google-ads-audit.md with the audit workflow.\n\nWe'll connect Google Ads and run it on a schedule.\n\nAlerts will also go to Slack.",
      ];

      for (const text of assistantFrames) {
        queueMicrotask(() => {
          this.emit("message", Buffer.from(JSON.stringify({
            type: "event",
            event: "agent",
            payload: {
              stream: "assistant",
              data: { text },
            },
          })));
        });
      }

      queueMicrotask(() => {
        this.emit("message", Buffer.from(JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            message: {
              content: JSON.stringify({
                type: "ready_for_review",
                content: assistantFrames.at(-1),
                system_name: "google-ads-optimizer",
                skill_graph: {
                  system_name: "google-ads-optimizer",
                  nodes: [
                    {
                      skill_id: "google-ads-audit",
                      name: "Google Ads Audit",
                      description: "Inspect campaign performance",
                      depends_on: [],
                      source: "custom",
                    },
                  ],
                  workflow: null,
                },
              }),
            },
          },
        })));
      });
      return;
    }

    queueMicrotask(() => {
      this.emit("message", Buffer.from(JSON.stringify({
        type: "event",
        event: "chat",
        payload: {
          state: "final",
          message: { content: scenario.finalMessage },
        },
      })));
    });
  }

  close() {}

  private emit(event: string, ...args: any[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

mock.module("ws", () => ({
  default: MockWebSocket,
}));

process.env.OPENCLAW_GATEWAY_URL = "ws://gateway.test";
process.env.OPENCLAW_GATEWAY_TOKEN = "token";
process.env.OPENCLAW_TIMEOUT_MS = "180000";
process.env.NEXT_PUBLIC_API_URL = "http://backend.test";

const defaultForgeSandboxId = "sandbox-123";

const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;

const { POST } = await import("./route");

beforeEach(() => {
  scenario.attempts = [];
  scenario.chatSendParams = [];
  scenario.approvalResolutions = [];
  scenario.finalMessage = "Finished";
  scenario.allowForgeHttpFallback = false;
  scenario.wsConstructed = 0;
  scenario.authStatus = 200;
  scenario.authFetches = [];
  globalThis.fetch = mock(async (input, init) => {
    const url = String(input);
    const authorization =
      init?.headers && typeof init.headers === "object" && "Authorization" in init.headers
        ? String((init.headers as Record<string, unknown>).Authorization)
        : null;

    if (url === "http://backend.test/users/me") {
      scenario.authFetches.push({ url, authorization });

      return new Response(
        scenario.authStatus === 200
          ? JSON.stringify({ id: "user-1" })
          : JSON.stringify({ error: "unauthorized" }),
        {
          status: scenario.authStatus,
          headers: { "content-type": "application/json" },
        },
      );
    }

    const sandboxMatch = url.match(/^http:\/\/backend\.test\/api\/sandboxes\/([^/]+)$/);
    if (sandboxMatch) {
      return new Response(
        JSON.stringify({
          id: sandboxMatch[1],
          standard_url: "http://sandbox.test",
          gateway_token: "token",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url === "http://sandbox.test") {
      return new Response("ok", { status: 200 });
    }

    if (
      scenario.allowForgeHttpFallback &&
      /^http:\/\/backend\.test\/api\/sandboxes\/[^/]+\/chat$/.test(url)
    ) {
      return new Response(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: scenario.finalMessage } }],
        })}\n` +
          "data: [DONE]\n",
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
    if ((timeout ?? 0) < 10_000) {
      return realSetTimeout(handler, 0, ...args);
    }
    return realSetTimeout(handler, timeout, ...args);
  }) as typeof setTimeout;
});

afterEach(() => {
  globalThis.setTimeout = realSetTimeout;
  globalThis.fetch = realFetch;
});

describe("POST /api/openclaw auth boundary", () => {
  test("rejects unauthenticated requests before opening the gateway connection", async () => {
    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-auth",
          message: "Build an agent",
        }),
      }) as any
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      detail: "Missing access token.",
    });
    expect(scenario.authFetches).toHaveLength(0);
    expect(scenario.wsConstructed).toBe(0);
  });

  test("rejects disallowed origins before opening the gateway connection", async () => {
    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          session_id: "session-origin",
          message: "Build an agent",
        }),
      }) as any
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden_origin",
      detail: "Origin must match the request host.",
    });
    expect(scenario.authFetches).toHaveLength(0);
    expect(scenario.wsConstructed).toBe(0);
  });

  test("validates the access token against the backend before streaming", async () => {
    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-auth-ok",
          message: "Build an agent",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    await response.text();

    expect(scenario.authFetches).toEqual([
      {
        url: "http://backend.test/users/me",
        authorization: "Bearer token-123",
      },
    ]);
    expect(scenario.wsConstructed).toBe(1);
  });
});

describe("POST /api/openclaw forge requirement", () => {
  test("fails closed without forge_sandbox_id and never opens the retired shared gateway", async () => {
    scenario.attempts = ["pre_ack_fail", "success"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-no-forge",
          message: "Build an agent",
          request_id: "req-no-forge",
        }),
      }) as any
    );

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(extractEventPayloads(body, "status")).toEqual([
      expect.objectContaining({
        phase: "error",
        message: "Agent workspace is not ready yet",
      }),
    ]);
    expect(extractResultEvent(body)).toEqual(
      expect.objectContaining({
        type: "error",
        error: "forge_sandbox_not_ready",
        request_id: "req-no-forge",
        content: expect.stringContaining("retired shared architect gateway"),
      }),
    );
    expect(scenario.authFetches).toEqual([
      {
        url: "http://backend.test/users/me",
        authorization: "Bearer token-123",
      },
    ]);
    expect(scenario.chatSendParams).toHaveLength(0);
    expect(scenario.wsConstructed).toBe(0);
  });
});

describe("POST /api/openclaw retry safety", () => {
  test("falls back after a pre-ack forge gateway failure without opening a second socket", async () => {
    scenario.attempts = ["pre_ack_fail"];
    scenario.allowForgeHttpFallback = true;
    scenario.finalMessage = "Recovered through forge HTTP fallback";

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-1",
          message: "Build an agent",
          request_id: "req-123",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    expect(scenario.chatSendParams).toHaveLength(1);
    expect(scenario.chatSendParams[0]?.idempotencyKey).toBe("req-123");
    expect(extractResultEvent(body)).toEqual(
      expect.objectContaining({
        type: "agent_response",
        content: "Recovered through forge HTTP fallback",
      }),
    );
    expect(scenario.wsConstructed).toBe(1);
  });

  test("does not resend chat.send after the gateway already acknowledged the run", async () => {
    scenario.attempts = ["post_ack_close"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-2",
          message: "Build an agent",
          request_id: "req-post-ack",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const text = await response.text();

    expect(scenario.chatSendParams).toHaveLength(1);
    expect(text).toContain("\"type\":\"error\"");
  });

  test("keeps tool_recommendation responses typed instead of downgrading them to generic prose", async () => {
    scenario.attempts = ["success"];
    scenario.finalMessage = JSON.stringify({
      type: "tool_recommendation",
      tool_name: "GitHub",
      recommended_method: "mcp",
      summary: "Use MCP.",
      rationale: "The product already supports the GitHub MCP server.",
      required_credentials: [],
      setup_steps: ["Generate a PAT."],
      integration_steps: ["Save the PAT in the connector UI."],
      validation_steps: ["List repositories."],
      alternatives: [],
      sources: [],
    });

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-tools",
          message: "Research GitHub integration options",
          request_id: "req-tools",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    expect(extractResultEvent(body)).toEqual(
      expect.objectContaining({
        type: "tool_recommendation",
        tool_name: "GitHub",
        recommended_method: "mcp",
      }),
    );
  });

  test("auto-allows a narrow safe approval request and emits an approval_auto_allowed event", async () => {
    scenario.attempts = ["approval_allowlisted"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-allowlist",
          message: "Inspect the repo",
          request_id: "req-allowlist",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    expect(extractEventPayloads(body, "approval_auto_allowed")).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "list_files",
        decision: "allow",
      }),
    ]);
    expect(scenario.approvalResolutions).toEqual([
      expect.objectContaining({
        id: "approval-1",
        decision: "allow",
      }),
    ]);
    expect(extractResultEvent(body)).toEqual(
      expect.objectContaining({
        type: "agent_response",
        content: "Finished",
      }),
    );
  });

  test("denies a non-allowlisted approval request, emits structured approval events, and fails closed", async () => {
    scenario.attempts = ["approval_denied"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-deny",
          message: "Patch the repo",
          request_id: "req-deny",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    expect(extractEventPayloads(body, "approval_required")).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
      }),
    ]);
    expect(extractEventPayloads(body, "approval_denied")).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolName: "apply_patch",
        decision: "deny",
      }),
    ]);
    expect(scenario.approvalResolutions).toEqual([
      expect.objectContaining({
        id: "approval-1",
        decision: "deny",
      }),
    ]);
    expect(extractResultEvent(body)).toEqual(
      expect.objectContaining({
        type: "error",
        error: "approval_denied",
      }),
    );
  });
});

describe("Copilot mode approval policy", () => {
  test("copilot mode allows apply_patch (file writes) that build mode denies", async () => {
    scenario.attempts = ["copilot_approval_write"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-copilot-write",
          message: "Create a skill file",
          request_id: "req-copilot-write",
          mode: "copilot",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    // apply_patch should be allowed in copilot mode
    expect(extractEventPayloads(body, "approval_auto_allowed")).toEqual([
      expect.objectContaining({
        approvalId: "approval-copilot",
        toolName: "apply_patch",
        decision: "allow",
      }),
    ]);
    expect(scenario.approvalResolutions).toEqual([
      expect.objectContaining({
        id: "approval-copilot",
        decision: "allow",
      }),
    ]);
  });

  test("copilot mode denies deploy operations", async () => {
    scenario.attempts = ["copilot_approval_deploy"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-copilot-deploy",
          message: "Deploy to production",
          request_id: "req-copilot-deploy",
          mode: "copilot",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    // deploy should still be denied in copilot mode
    expect(extractEventPayloads(body, "approval_denied")).toEqual([
      expect.objectContaining({
        approvalId: "approval-copilot",
        toolName: "deploy_agent",
        decision: "deny",
      }),
    ]);
    expect(scenario.approvalResolutions).toEqual([
      expect.objectContaining({
        id: "approval-copilot",
        decision: "deny",
      }),
    ]);
  });
});

describe("Bridge delta streaming", () => {
  test("emits incremental delta SSE events as agent text arrives", async () => {
    scenario.attempts = ["success_with_deltas"];
    scenario.finalMessage = "Hello world";

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-delta",
          message: "Say hello",
          request_id: "req-delta",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();

    // Should have delta events with incremental text chunks
    const deltas = extractEventPayloads(body, "delta");
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    // First delta should be "Hello "
    expect(deltas[0]).toEqual(
      expect.objectContaining({ text: "Hello " }),
    );
    // Second delta should be "world" (the incremental part)
    if (deltas.length > 1) {
      expect(deltas[1]).toEqual(
        expect.objectContaining({ text: "world" }),
      );
    }
  });

  test("emits ordered intermediate SSE events on the forge gateway path", async () => {
    scenario.attempts = ["success_with_intermediate_hints"];

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-intermediate",
          message: "Build a Google Ads optimizer",
          request_id: "req-intermediate",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();
    const updates = extractEventPayloads(body, "intermediate");

    expect(updates).toEqual([
      {
        kind: "identity",
        name: "Google Ads Optimizer",
        description: "",
      },
      {
        kind: "skill_discovered",
        skillId: "google-ads-audit",
        name: "Google Ads Audit",
        description: "",
      },
      {
        kind: "tool_hint",
        toolId: "google-ads",
      },
      {
        kind: "trigger_hint",
        triggerId: "cron-schedule",
      },
      {
        kind: "tool_hint",
        toolId: "slack",
      },
      {
        kind: "channel_hint",
        channelId: "slack",
      },
    ]);
  });

  test("parses a generic yaml code block with skill_graph as ready_for_review", async () => {
    scenario.attempts = ["success"];
    scenario.finalMessage = `Great, I'll build a Google Ads optimization agent for you!

\`\`\`yaml
type: ready_for_review
system_name: google-ads-optimizer
skill_graph:
  - skill_id: fetch_campaigns
    name: Fetch Campaigns
    description: Pull campaign data from Google Ads
    source: custom
    depends_on: []
  - skill_id: analyze_metrics
    name: Analyze Metrics
    description: Analyze campaign performance metrics
    source: custom
    depends_on:
      - fetch_campaigns
agent_metadata:
  agent_name: Google Ads Optimizer
  tone: professional
requirements:
  required_env_vars:
    - GOOGLE_ADS_API_KEY
\`\`\`

Let me know if you'd like to adjust anything!`;

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-yaml-skill",
          message: "Build me a Google Ads agent",
          request_id: "req-yaml-skill",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();
    const result = extractResultEvent(body);
    expect(result.type).toBe("ready_for_review");
    expect(result.skill_graph).toBeDefined();
    const sg = result.skill_graph as Record<string, unknown>;
    expect(Array.isArray(sg.nodes)).toBe(true);
    expect((sg.nodes as unknown[]).length).toBe(2);
  });

  test("parses a yaml block with nodes key as ready_for_review", async () => {
    scenario.attempts = ["success"];
    scenario.finalMessage = `Here's the agent:

\`\`\`yaml
nodes:
  - skill_id: data_fetch
    name: Data Fetch
    description: Fetch data
    source: custom
    depends_on: []
\`\`\``;

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-yaml-nodes",
          message: "Build agent",
          request_id: "req-yaml-nodes",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();
    const result = extractResultEvent(body);
    expect(result.type).toBe("ready_for_review");
    expect(result.skill_graph).toBeDefined();
  });

  test("falls through to agent_response when yaml block has no skill graph", async () => {
    scenario.attempts = ["success"];
    scenario.finalMessage = `Here's a config snippet:

\`\`\`yaml
database:
  host: localhost
  port: 5432
\`\`\``;

    const response = await POST(
      new Request("http://localhost/api/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "accessToken=token-123",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          session_id: "session-yaml-nosg",
          message: "Show config",
          request_id: "req-yaml-nosg",
          forge_sandbox_id: defaultForgeSandboxId,
        }),
      }) as any
    );

    const body = await response.text();
    const result = extractResultEvent(body);
    expect(result.type).toBe("agent_response");
  });
});
