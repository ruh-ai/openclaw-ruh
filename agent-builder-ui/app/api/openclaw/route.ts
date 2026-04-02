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

const DEFAULT_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "";
const DEFAULT_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const GATEWAY_ORIGIN =
  process.env.OPENCLAW_GATEWAY_ORIGIN || "https://clawagentbuilder.ruh.ai";
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PER_ATTEMPT_TIMEOUT_MS = parseInt(
  process.env.OPENCLAW_TIMEOUT_MS || "180000",
  10
);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const AUTH_ME_PATH = "/users/me";

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
  if (!httpUrl) {
    throw new Error(
      `Forge sandbox ${forgeSandboxId} has no gateway URL`
    );
  }

  // Health-check: verify the gateway is reachable before returning.
  // If the container is running but the gateway process crashed, attempt
  // to restart it via the backend before giving up.
  try {
    const probe = await fetch(httpUrl, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error(`probe status ${probe.status}`);
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
        // Wait a few seconds for the gateway to come up, then re-probe
        await new Promise((r) => setTimeout(r, 5000));
        const reProbe = await fetch(httpUrl, { signal: AbortSignal.timeout(3000) });
        if (!reProbe.ok) {
          throw new Error(`Gateway still unreachable after restart (status ${reProbe.status})`);
        }
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
                // Clear stale WS failures for copilot mode (build stage) so tool
                // events flow through — the HTTP fallback has no real-time events.
                if (resolvedMode === "copilot" && _forgeWsAuthFailures.has(forge_sandbox_id)) {
                  _forgeWsAuthFailures.delete(forge_sandbox_id);
                }
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

                if (!chatRes.ok) {
                  const errText = await chatRes.text().catch(() => "unknown error");
                  throw new Error(`Forge bridge failed (${chatRes.status}): ${errText.slice(0, 200)}`);
                }

                onLifecycleEvent({ phase: "thinking", message: "Agent thinking..." });

                const reader = chatRes.body?.getReader();
                if (!reader) throw new Error("No response body from forge bridge");

                // Periodic progress events to keep the UI alive during long builds.
                // The architect executes tools internally — no tool events stream
                // through the HTTP chat endpoint — so we emit synthetic phases.
                const buildPhases = [
                  { at: 10, phase: "planning", message: "Planning workspace structure..." },
                  { at: 25, phase: "writing", message: "Writing SOUL.md — agent personality..." },
                  { at: 45, phase: "generating", message: "Generating skill files..." },
                  { at: 80, phase: "configuring", message: "Configuring tools and integrations..." },
                  { at: 120, phase: "triggers", message: "Setting up triggers and schedules..." },
                  { at: 160, phase: "assembling", message: "Assembling skill graph..." },
                  { at: 200, phase: "working", message: "Still working — complex agents take time..." },
                ];
                const streamStart = Date.now();
                let nextPhaseIdx = 0;
                const progressInterval = setInterval(() => {
                  const elapsed = (Date.now() - streamStart) / 1000;
                  while (nextPhaseIdx < buildPhases.length && elapsed >= buildPhases[nextPhaseIdx].at) {
                    const bp = buildPhases[nextPhaseIdx];
                    send("status", { phase: bp.phase, message: bp.message });
                    nextPhaseIdx++;
                  }
                }, 5000);

                const decoder = new TextDecoder();
                let fullContent = "";
                let buffer = "";
                const emittedFiles = new Set<string>();
                const emittedSkills = new Set<string>();
                let lastScanIndex = 0;

                const scanForFileEvents = () => {
                  const scanText = fullContent.slice(lastScanIndex);
                  lastScanIndex = fullContent.length;

                  // Detect skill files from workspace paths
                  for (const m of scanText.matchAll(/skills\/([a-z0-9_-]+)\/SKILL\.md/gi)) {
                    const skillId = m[1];
                    if (!emittedSkills.has(skillId)) {
                      emittedSkills.add(skillId);
                      send("skill_created", { skillId, path: `skills/${skillId}/SKILL.md` });
                    }
                  }

                  // Detect skill names from conversational text (e.g., "Created skill: weather-intake")
                  for (const m of scanText.matchAll(/(?:creat|writ|generat|built)\w*\s+(?:skill|the)\s+["`']?([a-z][a-z0-9-]+)["`']?/gi)) {
                    const skillId = m[1].toLowerCase();
                    if (skillId.length > 3 && !emittedSkills.has(skillId)) {
                      emittedSkills.add(skillId);
                      send("skill_created", { skillId, path: `skills/${skillId}/SKILL.md` });
                    }
                  }

                  for (const m of scanText.matchAll(/\.openclaw\/workspace\/([^\s'"`\\]+)/g)) {
                    const filePath = m[1];
                    if (!emittedFiles.has(filePath)) {
                      emittedFiles.add(filePath);
                      send("file_written", { path: filePath, tool: "bash" });
                    }
                  }

                  // Detect file writes from conversational text
                  for (const m of scanText.matchAll(/(?:writ|creat|sav)\w+\s+["`']?([A-Z][A-Z_]+\.(?:md|yml|json|env))["`']?/gi)) {
                    const fileName = m[1];
                    if (!emittedFiles.has(fileName)) {
                      emittedFiles.add(fileName);
                      send("file_written", { path: fileName, tool: "bash" });
                    }
                  }

                  if (scanText.includes("SOUL.md") && !emittedFiles.has("SOUL.md")) {
                    emittedFiles.add("SOUL.md");
                    send("file_written", { path: "SOUL.md", tool: "bash" });
                  }

                  // Emit build_progress when we have skills
                  if (emittedSkills.size > 0) {
                    send("build_progress", { completed: emittedSkills.size, total: null, currentSkill: Array.from(emittedSkills).pop() });
                  }
                };

                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                      if (line.startsWith("event: ")) continue;
                      if (!line.startsWith("data: ")) continue;
                      const data = line.slice(6).trim();
                      if (data === "[DONE]") continue;

                      try {
                        const parsed = JSON.parse(data);

                        if (parsed.tool) {
                          send("tool_start", { tool: parsed.tool, input: parsed.input || "" });
                          const cmd = String(parsed.input || "");
                          const skillMatch = cmd.match(/skills\/([a-z0-9_-]+)\/SKILL\.md/i);
                          if (skillMatch) send("skill_created", { skillId: skillMatch[1], path: `skills/${skillMatch[1]}/SKILL.md` });
                          const fileMatch = cmd.match(/\.openclaw\/workspace\/([^\s'"]+)/);
                          if (fileMatch) {
                            send("file_written", { path: fileMatch[1], tool: parsed.tool });
                            send("workspace_changed", { action: "create", path: fileMatch[1] });
                          }
                          continue;
                        }

                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (typeof delta === "string" && delta) {
                          fullContent += delta;
                          send("delta", { text: delta });
                          scanForFileEvents();
                        }

                        if (parsed.phase) {
                          onLifecycleEvent({ phase: parsed.phase, message: parsed.message || "" });
                        }

                        if (parsed.message && !parsed.choices && !parsed.tool && !parsed.phase) {
                          send("status", { phase: "error", message: parsed.message });
                        }
                      } catch {
                        // Skip unparseable chunks
                      }
                    }
                  }
                } catch (streamErr) {
                  if ((streamErr as Error).name !== "AbortError") {
                    console.warn("[forge-bridge] Stream error:", streamErr);
                  }
                } finally {
                  clearInterval(progressInterval);
                }

                const rfrMatch = fullContent.match(/```(?:ready_for_review|discovery|architecture_plan)\s*\n?([\s\S]*?)```/) ||
                  fullContent.match(/```json\s*\n?([\s\S]*?"type"\s*:\s*"(?:ready_for_review|discovery|architecture_plan)"[\s\S]*?)```/) ||
                  fullContent.match(/\{[\s\S]*"type"\s*:\s*"(?:ready_for_review|discovery|architecture_plan)"[\s\S]*\}/);

                if (rfrMatch) {
                  try {
                    const jsonStr = rfrMatch[1] || rfrMatch[0];
                    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

                    // Emit skill_created for each node in the skill graph
                    // so the UI gets real skill events at build completion.
                    const nodes = (parsed.skill_graph as Record<string, unknown>)?.nodes;
                    if (Array.isArray(nodes)) {
                      for (const node of nodes) {
                        const n = node as Record<string, unknown>;
                        const skillId = (n.skill_id as string) || "";
                        if (skillId) {
                          send("skill_created", { skillId, path: `skills/${skillId}/SKILL.md` });
                        }
                      }
                      send("build_progress", {
                        completed: nodes.length,
                        total: nodes.length,
                        currentSkill: null,
                      });
                    }

                    return parsed as object;
                  } catch { /* fall through */ }
                }

                return { type: "agent_response", content: fullContent } as object;
              }

              // Shared architect gateway: direct WebSocket
              if (!DEFAULT_GATEWAY_URL) {
                throw new Error(
                  "No gateway available. The agent has no forge sandbox and OPENCLAW_GATEWAY_URL is not configured."
                );
              }
              const gateway: GatewayCredentials = {
                url: DEFAULT_GATEWAY_URL,
                token: DEFAULT_GATEWAY_TOKEN,
              };

              const response = await connectWithRetry(
                session_id,
                message,
                resolvedAgent,
                resolvedMode,
                typeof soul_override === "string" ? soul_override : undefined,
                onLifecycleEvent,
                send,
                requestId,
                req.signal,
                gateway,
                typeof timeout_ms === "number" ? Math.min(timeout_ms, 600_000) : undefined,
                trace
              );

              const responseType =
                typeof response === "object" &&
                response !== null &&
                "type" in response
                  ? (response as { type?: unknown }).type ?? null
                  : null;

              trace.update({
                statusMessage: "Bridge request succeeded",
                output: { type: responseType },
              });

              // Score the request outcome so quality trends appear in Langfuse
              const isSuccess = responseType !== "error";
              await trace.addScore(
                "request_success",
                isSuccess ? 1 : 0,
                isSuccess ? "Request completed successfully" : "Request ended with an error response"
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
  const gatewayUrl = gateway?.url || DEFAULT_GATEWAY_URL;
  const gatewayToken = gateway?.token || DEFAULT_GATEWAY_TOKEN;
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
          "OPENCLAW_GATEWAY_URL is not configured. Set it in your .env file."
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
  const token = gatewayToken || DEFAULT_GATEWAY_TOKEN;
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
