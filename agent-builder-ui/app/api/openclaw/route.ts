import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";
import { randomUUID } from "crypto";
import yaml from "js-yaml";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Chat logger — saves all request/response data to logs/openclaw-chat.log
// ---------------------------------------------------------------------------
const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "openclaw-chat.log");

function chatLog(direction: "SEND" | "RECV" | "INFO" | "USER" | "AGENT", data: unknown) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${direction}] ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    // Logging should never break the app
  }
}

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const GATEWAY_ORIGIN =
  process.env.OPENCLAW_GATEWAY_ORIGIN || "https://clawagentbuilder.ruh.ai";
const PER_ATTEMPT_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_TIMEOUT_MS || "600000",
  10
);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LifecycleEvent {
  phase: string;
  message: string;
  detail?: string;
}

class AuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEncode(event: string, data: object): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Lifecycle phase mapping
// ---------------------------------------------------------------------------

const PHASE_MESSAGES: Record<string, string> = {
  start: "Processing your inputs...",
  thinking: "Analyzing requirements...",
  planning: "Planning agent architecture...",
  searching: "Searching for existing skills...",
  generating: "Generating skill graph...",
  reviewing: "Reviewing agent design...",
  writing: "Preparing response...",
  end: "Complete",
};

function mapLifecyclePhase(phase: string): LifecycleEvent {
  return {
    phase,
    message: PHASE_MESSAGES[phase] || `Agent: ${phase}...`,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, message, agent } = body;

    chatLog("USER", { session_id, message, agent });

    if (!session_id || !message) {
      return NextResponse.json(
        { error: "session_id and message required" },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: object) => {
          try {
            controller.enqueue(sseEncode(event, data));
          } catch {
            // Controller may be closed if client disconnected
          }
        };

        const onLifecycleEvent = (evt: LifecycleEvent) => {
          send("status", evt);
        };

        try {
          const response = await connectWithRetry(
            session_id,
            message,
            agent || "architect",
            onLifecycleEvent
          );

          chatLog("AGENT", response);
          send("result", response as Record<string, unknown>);
        } catch (gatewayError) {
          const errMsg =
            gatewayError instanceof Error
              ? gatewayError.message
              : String(gatewayError);
          console.warn(
            "OpenClaw Gateway unreachable after retries:",
            errMsg
          );
          send("status", {
            phase: "error",
            message: "Unable to reach agent gateway",
          });
          send("result", {
            type: "error",
            error: errMsg,
            content: `Unable to reach the OpenClaw gateway. Please ensure the gateway is running.\n\nError: ${errMsg}`,
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Bridge API error:", error);
    return NextResponse.json(
      { type: "error", error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function connectWithRetry(
  sessionId: string,
  message: string,
  agentId: string,
  onLifecycleEvent: (evt: LifecycleEvent) => void
): Promise<object> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      onLifecycleEvent({
        phase: "connecting",
        message:
          attempt === 0
            ? "Connecting to agent..."
            : `Reconnecting (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      });

      if (!GATEWAY_URL) {
        throw new Error(
          "OPENCLAW_GATEWAY_URL is not configured. Set it in your .env file."
        );
      }
      return await forwardToGateway(
        GATEWAY_URL,
        sessionId,
        message,
        agentId,
        onLifecycleEvent
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof AuthError) {
        throw err;
      }

      console.warn(
        `[Gateway] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`,
        lastError.message
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        onLifecycleEvent({
          phase: "retrying",
          message: `Connection lost. Retrying in ${delay / 1000}s...`,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("All gateway connection attempts failed");
}

// ---------------------------------------------------------------------------
// Extract text from OpenClaw message
// ---------------------------------------------------------------------------

function extractMessageText(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message === "object" && message !== null) {
    const msg = message as Record<string, unknown>;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((b: Record<string, unknown>) => b.type === "text")
        .map((b: Record<string, unknown>) => b.text)
        .join("");
    }
    if (typeof msg.content === "string") return msg.content;
  }
  return "";
}

// ---------------------------------------------------------------------------
// WebSocket bridge (single attempt)
// ---------------------------------------------------------------------------

async function forwardToGateway(
  gatewayUrl: string,
  sessionId: string,
  message: string,
  agentId: string,
  onLifecycleEvent: (evt: LifecycleEvent) => void
): Promise<object> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(gatewayUrl, {
      headers: { Origin: GATEWAY_ORIGIN },
    });
    const timeout = setTimeout(() => {
      rejectOnce(
        new Error(
          `Gateway timeout (${PER_ATTEMPT_TIMEOUT_MS / 1000}s)`
        )
      );
    }, PER_ATTEMPT_TIMEOUT_MS);

    let connected = false;
    let resolved = false;
    let agentText = "";
    let runId = "";

    const resolveOnce = (value: object) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ws.close();
      resolve(value);
    };

    const rejectOnce = (err: Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ws.close();
      reject(err);
    };

    const finalizeResponse = (text: string) => {
      // Try JSON parse first
      try {
        resolveOnce(JSON.parse(text));
        return;
      } catch {
        // Not JSON, try other formats
      }

      // Try YAML code blocks tagged with response type
      const codeBlockMatch = text.match(
        /```(ready_for_review|clarification|deploy_complete|agent_response)\s*\n([\s\S]*?)```/
      );
      if (codeBlockMatch) {
        const blockType = codeBlockMatch[1];
        const blockContent = codeBlockMatch[2];
        try {
          const parsed = yaml.load(blockContent) as Record<string, unknown>;

          if (
            blockType === "ready_for_review" &&
            parsed?.skill_graph &&
            typeof parsed.skill_graph === "object"
          ) {
            const sg = parsed.skill_graph as Record<string, unknown>;
            const nodes = (
              (sg.nodes as Array<Record<string, unknown>>) || []
            ).map((node) => ({
              skill_id:
                (node.id as string) || (node.skill_id as string),
              name:
                (node.id as string) ||
                (node.skill_id as string) ||
                ((node.description as string) || "").slice(0, 40),
              source:
                (node.type as string) === "ingestion"
                  ? "data_ingestion"
                  : "custom",
              status:
                (node.type as string) === "trigger" ||
                (node.type as string) === "config"
                  ? "always_included"
                  : "generating",
              depends_on: (
                ((sg.edges as Array<Record<string, unknown>>) || [])
                  .filter((e) => e.to === node.id)
                  .map((e) => e.from as string)
              ),
              description: (node.description as string) || "",
            }));

            const workflow = {
              name: "main-workflow",
              description: `${(parsed.automation_type as string) || "pipeline"} — ${nodes.length} nodes`,
              steps: (
                (sg.edges as Array<Record<string, unknown>>) || []
              ).map((edge, i) => ({
                id: `step-${i}`,
                action: "execute",
                skill: edge.to as string,
                wait_for: [edge.from as string],
              })),
            };

            resolveOnce({
              type: "ready_for_review",
              skill_graph: {
                system_name:
                  (parsed.automation_type as string) ||
                  `system-${Date.now().toString(36)}`,
                nodes,
                workflow,
              },
              adapter_availability: buildAdapterAvailability(
                (sg.nodes as Array<Record<string, unknown>>) || []
              ),
              raw_spec: parsed,
            });
            return;
          }

          resolveOnce({ type: blockType, ...parsed });
          return;
        } catch (yamlErr) {
          console.warn("[Gateway] YAML parse failed:", yamlErr);
        }
      }

      // Check for clarification keywords
      if (
        text.includes("What I need from you") ||
        text.includes("questions") ||
        text.includes("?")
      ) {
        resolveOnce({
          type: "agent_response",
          runId,
          agent: agentId,
          content: text,
        });
        return;
      }

      // Default: wrap as agent_response
      resolveOnce({
        type: "agent_response",
        runId,
        agent: agentId,
        content: text,
      });
    };

    ws.on("error", (err) => {
      rejectOnce(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", () => {
      if (!connected) {
        rejectOnce(new Error("WebSocket closed before connect"));
      }
    });

    ws.on("message", (data) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }
      chatLog("RECV", frame);

      // Step 1: Server sends connect.challenge
      if (frame.type === "event" && frame.event === "connect.challenge") {
        const connectMsg = {
          type: "req",
          id: "1",
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "openclaw-control-ui",
              version: "2026.3.13",
              platform: "web",
              mode: "webchat",
            },
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            auth: { token: "***" },
          },
        };
        chatLog("SEND", connectMsg);
        ws.send(
          JSON.stringify({
            ...connectMsg,
            params: { ...connectMsg.params, auth: { token: GATEWAY_TOKEN } },
          })
        );
        return;
      }

      // Step 2: Server responds with hello-ok
      if (frame.type === "res" && frame.id === "1") {
        if (!frame.ok) {
          rejectOnce(
            new AuthError(
              `Auth failed: ${JSON.stringify(frame.error || frame.payload)}`
            )
          );
          return;
        }

        connected = true;
        onLifecycleEvent({
          phase: "authenticated",
          message: "Processing your inputs...",
        });

        // Step 3: Send chat.send
        const chatSendMsg = {
          type: "req",
          id: "2",
          method: "chat.send",
          params: {
            sessionKey: `agent:${agentId}:main`,
            message,
            idempotencyKey: randomUUID(),
            deliver: false,
          },
        };
        chatLog("SEND", chatSendMsg);
        ws.send(JSON.stringify(chatSendMsg));
        return;
      }

      // Step 3b: Acknowledge chat.send
      if (frame.type === "res" && frame.id === "2") {
        if (!frame.ok) {
          rejectOnce(
            new Error(
              `chat.send failed: ${JSON.stringify(frame.payload)}`
            )
          );
          return;
        }
        const payload = frame.payload as Record<string, unknown> | undefined;
        runId = (payload?.runId as string) || "";
        onLifecycleEvent({
          phase: "thinking",
          message: "Analyzing requirements...",
        });
        return;
      }

      // Step 4: Collect streamed chat events
      if (frame.type === "event" && frame.event === "chat") {
        const chat = frame.payload as Record<string, unknown>;
        if (chat.state === "final") {
          const finalText =
            extractMessageText(chat.message) || agentText;
          finalizeResponse(finalText);
        } else if (chat.state === "error") {
          const errorMsg =
            (chat.errorMessage as string) ||
            "Agent execution error";
          // Model-level errors should not be retried
          if (
            errorMsg.includes("failed_generation") ||
            errorMsg.includes("Failed to call a function") ||
            errorMsg.includes("rate_limit") ||
            errorMsg.includes("context_length")
          ) {
            resolveOnce({
              type: "error",
              error: errorMsg,
              content: `The agent encountered an error: ${errorMsg}. This may be a model limitation — try simplifying your message or the agent model may need upgrading.`,
            });
          } else {
            rejectOnce(new Error(errorMsg));
          }
        } else if (chat.state === "aborted") {
          rejectOnce(new Error("Agent execution aborted"));
        }
        return;
      }

      // Handle agent lifecycle and text events
      if (frame.type === "event" && frame.event === "agent") {
        const agentPayload = frame.payload as Record<string, unknown>;
        if (agentPayload.stream === "assistant") {
          const agentData = agentPayload.data as
            | Record<string, unknown>
            | undefined;
          agentText =
            (agentData?.text as string) || agentText;
        } else if (agentPayload.stream === "lifecycle") {
          const agentData = agentPayload.data as
            | Record<string, unknown>
            | undefined;
          const phase = agentData?.phase as string;
          onLifecycleEvent(mapLifecyclePhase(phase));
          if (phase === "end" && agentText) {
            finalizeResponse(agentText);
          }
        }
        return;
      }

      // Auto-approve tool executions
      if (
        frame.type === "event" &&
        frame.event === "exec.approval.requested"
      ) {
        const payload = frame.payload as Record<string, unknown>;
        const toolName =
          (payload.tool as string) ||
          (payload.name as string) ||
          (payload.id as string) ||
          "tool";
        onLifecycleEvent({
          phase: "tool_execution",
          message: `Executing: ${toolName}...`,
        });
        ws.send(
          JSON.stringify({
            type: "req",
            id: randomUUID(),
            method: "exec.approval.resolve",
            params: {
              id: payload.id,
              decision: "allow",
            },
          })
        );
        return;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: extract adapter availability from skill graph nodes
// ---------------------------------------------------------------------------

function buildAdapterAvailability(
  nodes: Array<Record<string, unknown>>
): Record<string, unknown> {
  const availability: Record<string, unknown> = {};
  for (const node of nodes) {
    if (
      node.type === "ingestion" &&
      Array.isArray(node.data_sources)
    ) {
      for (const ds of node.data_sources as Array<
        Record<string, unknown>
      >) {
        availability[ds.source_type as string] = {
          source_type: ds.source_type,
          has_adapter: ds.access_method === "adapter",
          access_method: ds.access_method,
        };
      }
    }
  }
  return availability;
}
