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

const GATEWAY_ORIGIN =
  process.env.OPENCLAW_GATEWAY_ORIGIN || "https://clawagentbuilder.ruh.ai";
// Server-side backend URL: use BACKEND_INTERNAL_URL (Docker service name) for
// server-to-server calls; NEXT_PUBLIC_API_URL is for browser-side (localhost port mapping).
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PER_ATTEMPT_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_TIMEOUT_MS || "180000",
  10
);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const AUTH_ME_PATH = "/api/auth/me";

type StreamEventSender = (event: string, data: object) => void;

// Cache forge gateways that reject WS auth so we don't retry every request.
// Key = sandbox_id, value = timestamp of last failure. Expires after 10 min.
const _forgeWsAuthFailures = new Map<string, number>();
const FORGE_WS_AUTH_CACHE_TTL_MS = 10 * 60 * 1000;

function shouldSkipForgeWs(sandboxId: string): boolean {
  const failedAt = _forgeWsAuthFailures.get(sandboxId);
  if (!failedAt) return false;
  if (Date.now() - failedAt > FORGE_WS_AUTH_CACHE_TTL_MS) {
    _forgeWsAuthFailures.delete(sandboxId);
    return false;
  }
  return true;
}

class AuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}

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
  token: string;
  /** Origin header to send when connecting. Forge sandboxes need an origin from their allowed list. */
  origin?: string;
  /** Daytona preview token to bypass Auth0 redirect on the preview URL proxy. */
  previewToken?: string;
}

/**
 * Resolve gateway credentials for a forge sandbox by querying the backend.
 * Converts HTTP URL to WebSocket URL for the gateway connection.
 */
async function resolveForgeGateway(
  forgeSandboxId: string
): Promise<GatewayCredentials> {
  const res = await fetch(`${BACKEND_URL}/api/sandboxes/${forgeSandboxId}`);
  if (!res.ok) {
    throw new Error(
      `Failed to resolve forge sandbox ${forgeSandboxId}: ${res.status}`
    );
  }
  const record = await res.json();
  const httpUrl: string = record.standard_url || record.dashboard_url || "";
  const gatewayToken: string = record.gateway_token || "";
  const previewToken: string = record.preview_token || "";
  if (!httpUrl) {
    throw new Error(
      `Forge sandbox ${forgeSandboxId} has no gateway URL`
    );
  }

  // Health-check: verify the gateway is reachable before returning.
  // Send both the gateway token (for openclaw auth) and the Daytona preview token
  // (to bypass Daytona's Auth0 redirect on the preview URL proxy).
  const probeHeaders: Record<string, string> = {};
  if (gatewayToken) {
    probeHeaders["Authorization"] = `Bearer ${gatewayToken}`;
  }
  if (previewToken) {
    probeHeaders["X-Daytona-Preview-Token"] = previewToken;
  }
  try {
    const probe = await fetch(httpUrl, {
      headers: probeHeaders,
      signal: AbortSignal.timeout(5000),
    });
    // 4xx = gateway is alive but rejecting the request (auth issue, bad path, etc.)
    // 5xx or connection error = gateway is actually down
    if (probe.status >= 500) throw new Error(`probe status ${probe.status}`);
  } catch (probeErr) {
    console.warn(
      `[Gateway] Forge sandbox ${forgeSandboxId} gateway at ${httpUrl} is unreachable, attempting restart...`,
    );
    // Ask the backend to restart the gateway inside the sandbox container.
    // POST /api/sandboxes/:id/gateway/restart is the standard restart endpoint.
    try {
      const restartRes = await fetch(
        `${BACKEND_URL}/api/sandboxes/${forgeSandboxId}/gateway/restart`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (restartRes.ok) {
        console.log(`[Gateway] Restart command sent for forge sandbox ${forgeSandboxId}, waiting for gateway...`);
        // Wait a few seconds for the gateway to come up, then re-probe
        await new Promise((r) => setTimeout(r, 5000));
        const reProbe = await fetch(httpUrl, {
          headers: probeHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (reProbe.status >= 500) {
          throw new Error(`Gateway still unreachable after restart (status ${reProbe.status})`);
        }
        console.log(`[Gateway] Forge sandbox ${forgeSandboxId} gateway recovered after restart`);
      } else {
        throw new Error(`Restart endpoint returned ${restartRes.status}`);
      }
    } catch (restartErr) {
      throw new Error(
        `Forge sandbox ${forgeSandboxId} gateway is unreachable at ${httpUrl} and restart failed: ${
          restartErr instanceof Error ? restartErr.message : String(restartErr)
        }`
      );
    }
  }

  // Convert HTTP URL to WebSocket URL
  const wsUrl = httpUrl
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
  // Derive an origin the forge sandbox will accept (localhost sandboxes allow http://localhost)
  const parsedUrl = new URL(httpUrl);
  const forgeOrigin = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  return {
    url: wsUrl,
    token: record.gateway_token || "",
    origin: forgeOrigin,
    previewToken,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedBridgeSession(req, {
      // Use the public URL for the dev bypass check (BACKEND_INTERNAL_URL uses
      // Docker service name "backend" which isn't recognized as localhost).
      backendUrl: process.env.NEXT_PUBLIC_API_URL || BACKEND_URL,
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

    if (!forge_sandbox_id || typeof forge_sandbox_id !== "string") {
      console.error(
        `[openclaw-bridge] 400: forge_sandbox_id missing. ` +
        `session_id=${session_id}, agent_id=${agent_id ?? "none"}, ` +
        `forge_sandbox_id=${JSON.stringify(forge_sandbox_id)}, ` +
        `agent=${agent ?? "architect"}, mode=${mode ?? "build"}`
      );
      return NextResponse.json(
        { error: "forge_sandbox_id is required. Every agent must have its own sandbox — create one via POST /api/agents/:id/forge first." },
        { status: 400 }
      );
    }

    console.log(
      `[openclaw-bridge] Request: session=${session_id}, forge_sandbox=${forge_sandbox_id}, ` +
      `agent=${agent ?? "architect"}, mode=${mode ?? "build"}, agent_id=${agent_id ?? "none"}`
    );

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
                  : ["sandbox:default"]),
              ],
            },
            async (trace) => {
              // Forge sandboxes: use the backend's WebSocket bridge endpoint
              // which connects to the container gateway from localhost (bypasses
              // device identity requirement). The backend handles auth, tool
              // approval, and streams events back as SSE.
              // Forge sandbox: try direct WebSocket (real tool events), fall
              // back to HTTP chat proxy if gateway rejects auth. The WS probe
              // is a single fast attempt — no retries — so fallback is instant.
              if (typeof forge_sandbox_id === "string" && forge_sandbox_id) {
                trace.recordEvent("openclaw.bridge.forge", {
                  forge_sandbox_id,
                });

                // ── Direct WebSocket (real tool events) ──
                // If the gateway accepts WS, we get tool_start/tool_end/file_written
                // events in real time. Falls back to HTTP proxy on auth failure.
                // Auth failures are cached so subsequent requests skip the WS probe.
                if (!shouldSkipForgeWs(forge_sandbox_id)) {
                  let forgeGateway: GatewayCredentials | null = null;
                  try {
                    forgeGateway = await resolveForgeGateway(forge_sandbox_id);
                  } catch {
                    // Sandbox unreachable — fall through to HTTP
                  }

                  if (forgeGateway) {
                    try {
                      const forgeTimeout = typeof timeout_ms === "number"
                        ? Math.min(timeout_ms, 600_000)
                        : PER_ATTEMPT_TIMEOUT_MS;
                      const wsResponse = await forwardToGateway(
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
                        forgeGateway.token,
                        forgeGateway.origin,
                        forgeTimeout,
                        trace,
                      );
                      return wsResponse;
                    } catch (wsErr) {
                      const msg = wsErr instanceof Error ? wsErr.message : "";
                      if (msg.includes("Auth failed") || msg.includes("device identity")) {
                        _forgeWsAuthFailures.set(forge_sandbox_id, Date.now());
                      }
                      console.warn(`[Gateway] Forge WS failed, falling back to HTTP: ${msg.slice(0, 120)}`);
                      trace.recordEvent("openclaw.bridge.forge_ws_fallback", { reason: msg.slice(0, 100) });
                    }
                  }
                }

                // ── HTTP chat proxy fallback ──
                onLifecycleEvent({ phase: "connecting", message: "Connecting to agent..." });

                const sessionKey = `agent:main:${session_id}`;
                const chatRes = await fetch(
                  `${BACKEND_URL}/api/sandboxes/${forge_sandbox_id}/chat`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(sessionKey ? { "x-openclaw-session-key": sessionKey } : {}),
                    },
                    body: JSON.stringify({
                      model: "openclaw",
                      stream: true,
                      messages: [
                        ...(typeof soul_override === "string" ? [{ role: "system", content: soul_override }] : []),
                        { role: "user", content: message },
                      ],
                      session_key: sessionKey,
                    }),
                    signal: AbortSignal.timeout(
                      typeof timeout_ms === "number" ? Math.min(timeout_ms, 600_000) : PER_ATTEMPT_TIMEOUT_MS
                    ),
                  },
                );

                console.log(`[bridge-fallback] chatRes status=${chatRes.status}, type=${chatRes.headers.get("content-type")}`);
                if (!chatRes.ok) {
                  const errText = await chatRes.text().catch(() => "unknown error");
                  console.log(`[bridge-fallback] error body: ${errText.slice(0, 200)}`);
                  throw new Error(`Forge bridge failed (${chatRes.status}): ${errText.slice(0, 200)}`);
                }

                // Read the full body to see what came back
                const chatBody = await chatRes.text();
                console.log(`[bridge-fallback] body len=${chatBody.length}, first_200=${chatBody.slice(0, 200)}`);

                onLifecycleEvent({ phase: "thinking", message: "Agent thinking..." });

                // Parse the SSE body manually (since we already consumed it with .text())
                const sseLines = chatBody.split("\n");
                let fullContent = "";
                for (const line of sseLines) {
                  if (!line.startsWith("data: ")) continue;
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta) {
                      fullContent += delta;
                      send("delta", { text: delta });
                    }
                    // Non-streaming response (choices[0].message.content)
                    const msg = parsed.choices?.[0]?.message?.content;
                    if (typeof msg === "string" && msg) {
                      fullContent += msg;
                      send("delta", { text: msg });
                    }
                  } catch {}
                }
                console.log(`[bridge-fallback] parsed fullContent="${fullContent.slice(0, 100)}"`);
                send("result", { type: "agent_response", content: fullContent, request_id: requestId });
                return { content: fullContent };
              }

              // No shared architect fallback — every agent must have its own forge sandbox.
              // This code path should be unreachable because we validate forge_sandbox_id
              // at the top of the handler.
              throw new Error(
                "forge_sandbox_id is required. Every agent must have its own sandbox."
              );
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
// Retry wrapper
// ---------------------------------------------------------------------------

async function connectWithRetry(
  sessionId: string,
  message: string,
  agentId: string,
  mode: OpenClawRequestMode,
  soulOverride: string | undefined,
  onLifecycleEvent: (evt: LifecycleEvent) => void,
  onStreamEvent: StreamEventSender,
  requestId: string,
  abortSignal?: AbortSignal,
  gateway?: GatewayCredentials,
  perAttemptTimeoutMs?: number,
  trace?: BridgeTraceHandle
): Promise<object> {
  const gatewayUrl = gateway?.url || "";
  const gatewayToken = gateway?.token || "";
  const gatewayOrigin = gateway?.origin || GATEWAY_ORIGIN;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      throwIfAborted(abortSignal);
      onLifecycleEvent({
        phase: "connecting",
        message:
          attempt === 0
            ? "Connecting to agent..."
            : `Reconnecting (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      });

      if (!gatewayUrl) {
        throw new Error(
          "No gateway URL available. Ensure the agent has a forge sandbox with a valid gateway."
        );
      }
      return await forwardToGateway(
        gatewayUrl,
        sessionId,
        message,
        agentId,
        mode,
        soulOverride,
        onLifecycleEvent,
        onStreamEvent,
        requestId,
        abortSignal,
        gatewayToken,
        gatewayOrigin,
        perAttemptTimeoutMs,
        trace
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (
        err instanceof AuthError ||
        err instanceof RequestAbortedError ||
        (err instanceof GatewayRetryBoundaryError &&
          err.stage === "post_accept")
      ) {
        throw err;
      }

      console.warn(
        `[Gateway][${requestId}] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`,
        lastError.message
      );
      trace?.recordEvent(
        "openclaw.bridge.retry",
        {
          attempt: attempt + 1,
          error: lastError.message,
        },
        "WARNING"
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        onLifecycleEvent({
          phase: "retrying",
          message: `Connection lost. Retrying in ${delay / 1000}s...`,
        });
        await waitFor(delay, abortSignal);
      }
    }
  }

  throw lastError || new Error("All gateway connection attempts failed");
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
  gatewayToken?: string,
  origin?: string,
  perAttemptTimeoutMs?: number,
  trace?: BridgeTraceHandle
): Promise<object> {
  const effectiveTimeout = perAttemptTimeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
  const token = gatewayToken || "";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(gatewayUrl, {
      headers: { Origin: origin || GATEWAY_ORIGIN },
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
      resolveOnce(
        finalizeGatewayResponse(text, {
          agentId,
          runId,
        }),
      );
    };

    ws.on("error", (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
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

    ws.on("close", () => {
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

      // Step 1: Server sends connect.challenge
      if (frame.type === "event" && frame.event === "connect.challenge") {
        ws.send(
          JSON.stringify({
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
              auth: { token },
            },
          })
        );
        return;
      }

      // Step 2: Server responds with hello-ok
      if (frame.type === "res" && frame.id === "1") {
        if (!frame.ok) {
          trace?.recordEvent(
            "openclaw.bridge.auth_failed",
            {
              request_id: requestId,
            },
            "ERROR"
          );
          rejectOnce(
            new AuthError(
              `Auth failed: ${JSON.stringify(frame.error || frame.payload)}`
            )
          );
          return;
        }

        connected = true;
        trace?.recordEvent("openclaw.bridge.connected", {
          request_id: requestId,
        });
        onLifecycleEvent({
          phase: "authenticated",
          message: "Agent started...",
        });

        // Step 3: Send chat.send
        // Use sessionId in the session key so every create-agent session gets its
        // own isolated conversation context on the gateway. Previously the hardcoded
        // "agent:architect:main" key meant all sessions shared one context — a
        // crash or malformed response in any session would poison every future one
        // until the gateway was restarted.
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

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new RequestAbortedError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
