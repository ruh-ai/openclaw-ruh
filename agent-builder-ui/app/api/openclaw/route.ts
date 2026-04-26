// @kb: 008-agent-builder-ui 001-architecture
import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";
import { randomUUID } from "crypto";
import { evaluateApprovalRequest } from "@/lib/openclaw/approval-policy";
import {
  requireAuthenticatedBridgeSession,
  RouteAuthError,
} from "@/lib/openclaw/bridge-auth";
import { classifyGatewayRunError } from "@/lib/openclaw/error-classification";
import {
  extractMessageText,
  finalizeGatewayResponse,
} from "@/lib/openclaw/gateway-response";
import { extractIntermediateUpdates } from "@/lib/openclaw/intermediate-updates";
import {
  withLangfuseBridgeTrace,
  type BridgeTraceHandle,
  type ToolSpanHandle,
} from "@/lib/openclaw/langfuse";
import {
  buildGatewaySessionKey,
  buildGatewayUserMessage,
  type OpenClawRequestMode,
} from "@/lib/openclaw/test-mode";
import type { LifecycleEvent } from "@/lib/openclaw/types";

export const runtime = "nodejs";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PER_ATTEMPT_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_TIMEOUT_MS || "180000",
  10
);
const AUTH_ME_PATH = "/api/auth/me";

type StreamEventSender = (event: string, data: object) => void;

class RequestAbortedError extends Error {
  constructor(msg = "Request aborted by client") {
    super(msg);
    this.name = "RequestAbortedError";
  }
}

class GatewayRetryBoundaryError extends Error {
  readonly stage: "pre_accept" | "post_accept";

  constructor(stage: "pre_accept" | "post_accept", msg: string) {
    super(msg);
    this.name = "GatewayRetryBoundaryError";
    this.stage = stage;
  }
}

function buildMissingForgeSandboxResponse(requestId: string) {
  return {
    type: "error" as const,
    error: "forge_sandbox_required",
    content:
      "This builder/test request requires a forge sandbox. Create or resume the agent container before retrying.",
    request_id: requestId,
  };
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
  start: "Agent started...",
  thinking: "Agent thinking...",
  planning: "Planning approach...",
  searching: "Searching for existing skills...",
  generating: "Generating skill graph...",
  reviewing: "Reviewing results...",
  writing: "Writing response...",
  end: "Complete",
};

function mapLifecyclePhase(phase: string): LifecycleEvent {
  return {
    phase,
    message: PHASE_MESSAGES[phase] || `Agent: ${phase}...`,
  };
}

// ---------------------------------------------------------------------------
// Forge sandbox gateway resolution
// ---------------------------------------------------------------------------

interface GatewayCredentials {
  url: string;
  /** Origin header to send when connecting. Forge sandboxes need an origin from their allowed list. */
  origin?: string;
}

/**
 * Resolve gateway credentials for a forge sandbox.
 *
 * Routes through the backend's WebSocket proxy at /ws/gateway/{sandboxId}
 * instead of connecting directly to the container gateway. The backend proxy
 * handles auth (gateway_token) server-side and supports the full OpenClaw
 * gateway protocol including tool execution, file writes, and lifecycle events.
 *
 * Direct WS to the container fails with token_mismatch because the DB stores
 * the config auth token while the gateway's WS connect method expects the
 * device operator token. The backend proxy resolves this internally.
 */
async function resolveForgeGateway(
  forgeSandboxId: string,
  cookieHeader?: string,
): Promise<GatewayCredentials> {
  // Verify the sandbox exists and has a gateway
  const res = await fetch(`${BACKEND_URL}/api/sandboxes/${forgeSandboxId}`);
  if (!res.ok) {
    throw new Error(
      `Failed to resolve forge sandbox ${forgeSandboxId}: ${res.status}`
    );
  }
  const record = await res.json();
  const httpUrl: string = record.standard_url || record.dashboard_url || "";
  if (!httpUrl) {
    throw new Error(
      `Forge sandbox ${forgeSandboxId} has no gateway URL`
    );
  }

  // Health-check: verify the gateway is reachable before returning.
  try {
    const probe = await fetch(httpUrl, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error(`probe status ${probe.status}`);
  } catch {
    // Try restart
    try {
      const restartRes = await fetch(
        `${BACKEND_URL}/api/sandboxes/${forgeSandboxId}/gateway/restart`,
        { method: "POST", signal: AbortSignal.timeout(20000) },
      );
      if (restartRes.ok) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch { /* ignore restart failure */ }
  }

  // Route through the backend WebSocket proxy instead of direct connection.
  // The proxy at /ws/gateway/{sandboxId} handles gateway auth server-side
  // using the stored gateway_token — no token mismatch issues.
  const backendWsUrl = BACKEND_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const proxyUrl = `${backendWsUrl}/ws/gateway/${forgeSandboxId}`;

  return {
    url: proxyUrl,
    // The backend proxy authenticates via the accessToken cookie
    // (forwarded in the WS Cookie header by forwardToGateway) and
    // handles the gateway_token handshake server-side.
    origin: "http://localhost",
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedBridgeSession(req, {
      backendUrl: BACKEND_URL,
      authMePath: AUTH_ME_PATH,
      nodeEnv: process.env.NODE_ENV,
      allowLocalDevelopmentBypass: true,
    });

    const body = await req.json();
    const { session_id, request_id, message, agent, mode, soul_override, forge_sandbox_id, timeout_ms, agent_id } = body;
    const requestId =
      typeof request_id === "string" && request_id.trim()
        ? request_id.trim()
        : randomUUID();

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

        // SSE keepalive: send comment lines every 30s to prevent proxy idle timeouts
        const keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(":keepalive\n\n"));
          } catch {
            clearInterval(keepaliveInterval);
          }
        }, 30_000);

        const onLifecycleEvent = (evt: LifecycleEvent) => {
          send("status", evt);
        };

        try {
          const resolvedMode =
            mode === "test"
              ? "test"
              : mode === "copilot"
                ? "copilot"
                : mode === "agent"
                  ? "agent"
                  : "build";
          const resolvedAgent = agent || "architect";

          const traced = await withLangfuseBridgeTrace(
            {
              name: "openclaw.bridge.request",
              input: {
                message,
                requestId,
              },
              metadata: {
                session_id,
                agent: resolvedAgent,
                mode: resolvedMode,
                agent_id: typeof agent_id === "string" ? agent_id : null,
                forge_sandbox_id:
                  typeof forge_sandbox_id === "string" && forge_sandbox_id
                    ? forge_sandbox_id
                    : null,
              },
              // Session groups all turns of this conversation together
              sessionId: session_id,
              // User: per-agent instance when available, falls back to agent type
              userId: typeof agent_id === "string" && agent_id
                ? agent_id
                : resolvedAgent,
              // Tags let you filter by mode, agent type, and agent instance
              tags: [
                `mode:${resolvedMode}`,
                `agent:${resolvedAgent}`,
                ...(typeof agent_id === "string" && agent_id
                  ? [`agent-id:${agent_id}`]
                  : []),
                ...(typeof forge_sandbox_id === "string" && forge_sandbox_id
                  ? ["sandbox:forge"]
                  : ["sandbox:missing"]),
              ],
            },
            async (trace) => {
              // Forge sandboxes: use the backend's WebSocket bridge.
              // Everything-WS mandate: there is no HTTP fallback.
              // If the WS connection fails, the error surfaces loudly to the
              // caller rather than being papered over by a parallel HTTP path.
              if (typeof forge_sandbox_id === "string" && forge_sandbox_id) {
                trace.recordEvent("openclaw.bridge.forge", {
                  forge_sandbox_id,
                });

                const forgeGateway = await resolveForgeGateway(
                  forge_sandbox_id,
                  req.headers.get("cookie") ?? undefined,
                );

                const forgeTimeout = typeof timeout_ms === "number"
                  ? Math.min(timeout_ms, 600_000)
                  : PER_ATTEMPT_TIMEOUT_MS;
                return await forwardToGateway(
                  forgeGateway.url,
                  session_id,
                  message,
                  resolvedAgent,
                  resolvedMode,
                  typeof soul_override === "string" ? soul_override : undefined,
                  onLifecycleEvent,
                  send,
                  requestId,
                  req.signal,
                  forgeGateway.origin,
                  forgeTimeout,
                  trace,
                  req.headers.get("cookie") ?? undefined,
                );
              }

              const response = buildMissingForgeSandboxResponse(requestId);
              onLifecycleEvent({
                phase: "error",
                message: "No forge sandbox is available for this agent",
              });
              trace.recordEvent(
                "openclaw.bridge.shared_path_retired",
                {
                  request_id: requestId,
                  reason: "forge_sandbox_required",
                },
                "WARNING"
              );
              trace.update({
                statusMessage: "Bridge request blocked: forge sandbox missing",
                output: {
                  type: response.type,
                  error: response.error,
                },
                metadata: {
                  reason: "forge_sandbox_required",
                },
                level: "WARNING",
              });
              await trace.addScore(
                "request_success",
                0,
                "Request blocked because the per-agent forge sandbox is required"
              );

              return response;
            }
          );

          const responsePayload =
            traced.traceId &&
            typeof traced.result === "object" &&
            traced.result !== null
              ? {
                  ...(traced.result as Record<string, unknown>),
                  trace_id: traced.traceId,
                }
              : (traced.result as Record<string, unknown>);

          send("result", responsePayload);
        } catch (gatewayError) {
          if (gatewayError instanceof RequestAbortedError) {
            clearInterval(keepaliveInterval);
            controller.close();
            return;
          }

          const errMsg =
            gatewayError instanceof Error
              ? gatewayError.message
              : String(gatewayError);

          if (
            gatewayError instanceof GatewayRetryBoundaryError &&
            gatewayError.stage === "post_accept"
          ) {
            console.warn(
              `[Gateway][${requestId}] connection dropped after run acceptance:`,
              errMsg
            );
            send("status", {
              phase: "error",
              message: "Connection lost after the agent run started",
            });
            send("result", {
              type: "error",
              error: errMsg,
              content:
                "The architect run was accepted before the connection dropped, so it may still be running remotely. Start a new request only if you want a new run.",
              request_id: requestId,
            });
          } else {
            console.warn(
              `[Gateway][${requestId}] unreachable after retries:`,
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
              request_id: requestId,
            });
          }
        }

        clearInterval(keepaliveInterval);
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
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        {
          error: error.code,
          detail: error.detail,
        },
        { status: error.status }
      );
    }
    console.error("Bridge API error:", error);
    return NextResponse.json(
      { type: "error", error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// WebSocket bridge (single attempt)
// ---------------------------------------------------------------------------

async function forwardToGateway(
  gatewayUrl: string,
  sessionId: string,
  message: string,
  agentId: string,
  mode: OpenClawRequestMode,
  soulOverride: string | undefined,
  onLifecycleEvent: (evt: LifecycleEvent) => void,
  onStreamEvent: StreamEventSender,
  requestId: string,
  abortSignal?: AbortSignal,
  origin?: string,
  perAttemptTimeoutMs?: number,
  trace?: BridgeTraceHandle,
  cookieHeader?: string,
): Promise<object> {
  const effectiveTimeout = perAttemptTimeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const wsHeaders: Record<string, string> = {};
    if (origin) wsHeaders["Origin"] = origin;
    if (cookieHeader) wsHeaders["Cookie"] = cookieHeader;
    const ws = new WebSocket(gatewayUrl, {
      headers: Object.keys(wsHeaders).length > 0 ? wsHeaders : undefined,
    });
    let chatAccepted = false;
    const timeout = setTimeout(() => {
      rejectOnce(
        new GatewayRetryBoundaryError(
          chatAccepted ? "post_accept" : "pre_accept",
          `Gateway timeout (${effectiveTimeout / 1000}s)`
        )
      );
    }, effectiveTimeout);

    let connected = false;
    let resolved = false;
    let agentText = "";
    let runId = "";
    let activeToolName: string | null = null;
    let activeToolSpan: ToolSpanHandle | null = null;
    let skillsWrittenCount = 0;
    const emittedIntermediateUpdates = new Set<string>();

    /** End the active tool span, if any, before transitioning phase. */
    const endActiveToolSpan = (output?: unknown) => {
      if (activeToolSpan) {
        activeToolSpan.end(output);
        activeToolSpan = null;
      }
    };

    const resolveOnce = (value: object) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", onAbort);
      ws.close();
      resolve(value);
    };

    const rejectOnce = (err: Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", onAbort);
      ws.close();
      reject(err);
    };

    const onAbort = () => {
      trace?.recordEvent(
        "openclaw.bridge.request_aborted",
        {
          request_id: requestId,
          run_id: runId || null,
        },
        "WARNING"
      );
      rejectOnce(new RequestAbortedError());
    };

    throwIfAborted(abortSignal);
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    const finalizeResponse = (text: string) => {
      console.log(`[bridge][${requestId}] finalize — textLen=${text.length} runId=${runId}`);
      resolveOnce(
        finalizeGatewayResponse(text, {
          agentId,
          runId,
        }),
      );
    };

    ws.on("error", (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn(`[bridge][${requestId}] ws.error stage=${chatAccepted ? "post_accept" : "pre_accept"} msg=${error.message}`);
      trace?.recordEvent(
        "openclaw.bridge.socket_error",
        {
          request_id: requestId,
          run_id: runId || null,
          stage: chatAccepted ? "post_accept" : "pre_accept",
        },
        "ERROR"
      );
      rejectOnce(
        new GatewayRetryBoundaryError(
          chatAccepted ? "post_accept" : "pre_accept",
          error.message
        )
      );
    });

    ws.on("close", (code?: number, reason?: Buffer) => {
      const reasonStr = reason?.toString() || "n/a";
      const stage = !connected ? "pre_connect" : chatAccepted ? "post_accept" : "pre_accept";
      console.warn(`[bridge][${requestId}] ws.close stage=${stage} code=${code ?? "?"} reason="${reasonStr}" resolved=${resolved} aborted=${abortSignal?.aborted ?? false}`);
      if (!connected) {
        trace?.recordEvent(
          "openclaw.bridge.socket_closed",
          {
            request_id: requestId,
            run_id: runId || null,
            stage: "pre_accept",
          },
          "WARNING"
        );
        rejectOnce(
          new GatewayRetryBoundaryError(
            "pre_accept",
            "WebSocket closed before connect"
          )
        );
      } else if (chatAccepted) {
        trace?.recordEvent(
          "openclaw.bridge.socket_closed",
          {
            request_id: requestId,
            run_id: runId || null,
            stage: "post_accept",
          },
          "WARNING"
        );
        rejectOnce(
          new GatewayRetryBoundaryError(
            "post_accept",
            "WebSocket closed after agent run started"
          )
        );
      }
    });

    ws.on("message", (data) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Step 1: Backend proxy signals it has authenticated with the gateway.
      // The proxy intercepts the real connect.challenge/res handshake server-side
      // (so the gateway_token never reaches this process) and emits a synthetic
      // `proxy_ready` frame once auth succeeds. After this we go straight to
      // chat.send — no CONNECT_REQUEST from this side.
      // See: ruh-backend/src/gatewayProxy.ts
      if (frame.type === "proxy_ready") {
        if (connected) return; // idempotent
        connected = true;
        console.log(`[bridge][${requestId}] proxy_ready — sending chat.send (msgLen=${message.length})`);
        trace?.recordEvent("openclaw.bridge.connected", {
          request_id: requestId,
        });
        onLifecycleEvent({
          phase: "authenticated",
          message: "Agent started...",
        });

        // Step 2: Send chat.send
        // Use sessionId in the session key so every create-agent session gets its
        // own isolated conversation context on the gateway. Builder sandboxes
        // explicitly register architect/copilot/test/reveal agents, each backed
        // by workspace-architect, so the session key also selects the role.
        ws.send(
          JSON.stringify({
            type: "req",
            id: "2",
            method: "chat.send",
            params: {
              sessionKey: buildGatewaySessionKey(agentId, sessionId, mode),
              message: buildGatewayUserMessage(message, {
                mode,
                soulOverride,
              }),
              idempotencyKey: requestId,
              deliver: false,
            },
          })
        );
        return;
      }

      // Step 3b: Acknowledge chat.send
      if (frame.type === "res" && frame.id === "2") {
        if (!frame.ok) {
          console.warn(`[bridge][${requestId}] chat.send rejected:`, JSON.stringify(frame.payload));
          rejectOnce(
            new Error(
              `chat.send failed: ${JSON.stringify(frame.payload)}`
            )
          );
          return;
        }
        const payload = frame.payload as Record<string, unknown> | undefined;
        runId = (payload?.runId as string) || "";
        chatAccepted = true;
        console.log(`[bridge][${requestId}] chat.send ack — runId=${runId}`);
        trace?.recordEvent("openclaw.bridge.chat_accepted", {
          request_id: requestId,
          run_id: runId || null,
        });
        onLifecycleEvent({
          phase: "thinking",
          message: "Agent thinking...",
        });
        return;
      }

      // Step 4: Collect streamed chat events
      if (frame.type === "event" && frame.event === "chat") {
        const chat = frame.payload as Record<string, unknown>;
        if (chat.state === "final") {
          const finalText =
            extractMessageText(chat.message) || agentText;
          endActiveToolSpan();
          // Record the final agent response as a generation so it appears in
          // the Langfuse Generations view with response-length usage data.
          trace?.recordGeneration("openclaw.bridge.generation", {
            input: { message: undefined }, // message already on root span
            output: { text: finalText },
            model: "openclaw-architect",
            usageDetails: {
              output: finalText.length,
              total: finalText.length,
            },
            metadata: {
              request_id: requestId,
              run_id: runId || null,
            },
          });
          trace?.recordEvent("openclaw.bridge.chat_final", {
            request_id: requestId,
            run_id: runId || null,
            response_length: finalText.length,
          });
          finalizeResponse(finalText);
        } else if (chat.state === "error") {
          const errorMsg =
            (chat.errorMessage as string) ||
            "Agent execution error";
          const classification = classifyGatewayRunError(errorMsg);
          trace?.recordEvent(
            "openclaw.bridge.chat_error",
            {
              request_id: requestId,
              run_id: runId || null,
              retryable: classification.retryable,
            },
            "ERROR"
          );
          if (!classification.retryable && classification.response) {
            resolveOnce(classification.response);
          } else {
            rejectOnce(
              new GatewayRetryBoundaryError(
                chatAccepted ? "post_accept" : "pre_accept",
                errorMsg
              )
            );
          }
        } else if (chat.state === "aborted") {
          trace?.recordEvent(
            "openclaw.bridge.chat_aborted",
            {
              request_id: requestId,
              run_id: runId || null,
            },
            "ERROR"
          );
          rejectOnce(
            new GatewayRetryBoundaryError(
              chatAccepted ? "post_accept" : "pre_accept",
              "Agent execution aborted"
            )
          );
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
          const newText =
            (agentData?.text as string) || agentText;
          // Emit incremental delta SSE events for workspace panel extraction
          if (newText.length > agentText.length) {
            const chunk = newText.slice(agentText.length);
            onStreamEvent("delta", { text: chunk });
            for (const update of extractIntermediateUpdates(
              newText,
              emittedIntermediateUpdates,
            )) {
              onStreamEvent("intermediate", update);
            }
          }
          agentText = newText;
        } else if (agentPayload.stream === "lifecycle") {
          const agentData = agentPayload.data as
            | Record<string, unknown>
            | undefined;
          const phase = agentData?.phase as string;
          // Emit tool_end when lifecycle moves away from tool_execution
          if (activeToolName && phase !== "tool_execution") {
            onStreamEvent("tool_end", { tool: activeToolName });
            endActiveToolSpan();
            activeToolName = null;
          }
          onLifecycleEvent(mapLifecyclePhase(phase));
          if (phase === "end" && agentText) {
            endActiveToolSpan();
            finalizeResponse(agentText);
          }
        }
        return;
      }

      // Auto-approve tool executions (mode-aware)
      if (
        frame.type === "event" &&
        frame.event === "exec.approval.requested"
      ) {
        const payload = frame.payload as Record<string, unknown>;
        const evaluation = evaluateApprovalRequest(payload, { mode });

        if (evaluation.decision === "allow") {
          trace?.recordEvent("openclaw.bridge.approval_allowed", {
            request_id: requestId,
            run_id: runId || null,
            approval_id: evaluation.autoAllowedEvent.approvalId,
            tool_name: evaluation.toolName,
            mode,
          });
          onStreamEvent("approval_auto_allowed", evaluation.autoAllowedEvent);
          // Emit structured tool_start event so the frontend can drive tab switching
          if (activeToolName && activeToolName !== evaluation.toolName) {
            onStreamEvent("tool_end", { tool: activeToolName });
            endActiveToolSpan();
          }
          activeToolName = evaluation.toolName;
          // Start a timed tool span — ended when lifecycle leaves tool_execution
          activeToolSpan = trace?.startToolSpan(evaluation.toolName, {
            approval_id: evaluation.autoAllowedEvent.approvalId,
            run_id: runId || null,
            mode,
          }) ?? null;
          onStreamEvent("tool_start", {
            tool: evaluation.toolName,
            input: evaluation.autoAllowedEvent.summary,
          });

          // Detect workspace file writes from tool commands and emit
          // structured events so the UI can update in real-time.
          const toolSummary = String(evaluation.autoAllowedEvent.summary || "");
          const toolCommand = String(payload.command || payload.description || toolSummary);
          const skillMatch = toolCommand.match(/skills\/([a-z0-9_-]+)\/SKILL\.md/i);
          const fileWriteMatch = toolCommand.match(/\.openclaw\/workspace\/([^\s'"]+)/);

          if (skillMatch) {
            skillsWrittenCount++;
            const skillId = skillMatch[1];
            onStreamEvent("skill_created", { skillId, path: `skills/${skillId}/SKILL.md` });
            onStreamEvent("build_progress", {
              completed: skillsWrittenCount,
              total: null,
              currentSkill: skillId,
            });
          }
          if (fileWriteMatch) {
            const filePath = fileWriteMatch[1];
            onStreamEvent("file_written", { path: filePath, tool: evaluation.toolName });
            onStreamEvent("workspace_changed", { action: "create", path: filePath });
          }

          onLifecycleEvent({
            phase: "tool_execution",
            message: `Executing: ${evaluation.toolName}...`,
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

        endActiveToolSpan({ denied: true });
        trace?.recordEvent(
          "openclaw.bridge.approval_denied",
          {
            request_id: requestId,
            run_id: runId || null,
            approval_id: evaluation.requiredEvent.approvalId,
            tool_name: evaluation.toolName,
            mode,
          },
          "WARNING"
        );
        onStreamEvent("approval_required", evaluation.requiredEvent);
        onStreamEvent("approval_denied", evaluation.deniedEvent);
        ws.send(
          JSON.stringify({
            type: "req",
            id: randomUUID(),
            method: "exec.approval.resolve",
            params: {
              id: payload.id,
              decision: "deny",
            },
          })
        );
        resolveOnce({
          type: "error",
          error: "approval_denied",
          content: evaluation.deniedEvent.message,
          request_id: requestId,
        });
        return;
      }
    });
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RequestAbortedError();
  }
}
