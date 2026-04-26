import { ApprovalEvent, ArchitectResponse } from "./types";
import type { IntermediateUpdate } from "./intermediate-updates";
import type { OpenClawRequestMode } from "./test-mode";
import { sendViaGatewayProxy } from "./gateway-ws-adapter";

export interface StreamCallbacks {
  onStatus?: (phase: string, message: string) => void;
  onApprovalEvent?: (event: ApprovalEvent) => void;
  onDelta?: (text: string) => void;
  onIntermediate?: (update: IntermediateUpdate) => void;
  /** Generic handler for custom SSE events (file_written, skill_created, build_progress, workspace_changed). */
  onCustomEvent?: (name: string, data: unknown) => void;
}

export interface SendToArchitectOptions {
  mode?: OpenClawRequestMode;
  soulOverride?: string;
  requestId?: string;
  signal?: AbortSignal;
  /** When set, routes chat through the forge sandbox's own gateway instead of the shared one. */
  forgeSandboxId?: string;
  /** Agent instance ID for per-agent Langfuse trace grouping. */
  agentId?: string;
  /** Timeout in ms for individual SSE reads. Defaults to 90 000 ms. */
  readTimeoutMs?: number;
}

const DEFAULT_SSE_READ_TIMEOUT_MS = 180_000;

// ─── Trace instrumentation ─────────────────────────────────────────────────
// Client-side trace for diagnosing premature SSE disconnects. Enable with
// ?trace=reveal in the URL or localStorage.setItem('reveal-trace', '1').
// Logs every SSE event, abort signal, and stream-end cause. The trace is
// keyed by requestId so events from concurrent streams don't interleave.
function isTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem("reveal-trace") === "1") return true;
    return new URLSearchParams(window.location.search).get("trace") === "reveal";
  } catch {
    return false;
  }
}

function traceLog(id: string, event: string, detail?: unknown): void {
  if (!isTraceEnabled()) return;
  const t = ((performance?.now?.() ?? Date.now()) | 0);
  if (detail === undefined) {
    console.log(`[reveal-trace ${id} t=${t}] ${event}`);
  } else {
    console.log(`[reveal-trace ${id} t=${t}] ${event}`, detail);
  }
}

export class BridgeApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly isAuthError: boolean;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "BridgeApiError";
    this.status = status;
    this.code = code;
    this.isAuthError =
      status === 401 ||
      status === 403 ||
      code === "unauthorized" ||
      code === "forbidden_origin" ||
      code === "auth_unavailable";
  }
}

function normalizeSseChunk(chunk: string): string {
  return chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Send a message to the OpenClaw architect agent.
 * When a forge sandbox ID is provided, tries the backend WS proxy first
 * for bidirectional real-time events. Falls back to the HTTP SSE bridge.
 */
export async function sendToArchitectStreaming(
  sessionId: string,
  message: string,
  callbacks?: StreamCallbacks,
  options?: SendToArchitectOptions
): Promise<ArchitectResponse> {
  // WS proxy is built but disabled for now — cross-origin WebSocket from
  // localhost:3000 to localhost:8000 doesn't send cookies, so JWT auth fails.
  // TODO: Enable when backend and frontend share the same origin (behind nginx)
  // or when the proxy supports token-based auth via query param.
  // See: gateway-ws-adapter.ts, gatewayProxy.ts, use-gateway-ws.ts

  const traceId = options?.requestId || `${sessionId.slice(-8)}-${(performance?.now?.() | 0) || Date.now()}`;
  traceLog(traceId, "fetch.start", {
    sessionId,
    mode: options?.mode,
    forgeSandboxId: options?.forgeSandboxId,
    messageLen: message.length,
    hasSignal: !!options?.signal,
    signalAborted: options?.signal?.aborted ?? false,
  });
  options?.signal?.addEventListener("abort", () => {
    traceLog(traceId, "signal.abort", { reason: String(options.signal?.reason ?? "unknown") });
  }, { once: true });

  // HTTP SSE bridge (fallback or when no forge sandbox)
  const res = await fetch("/api/openclaw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify({
      session_id: sessionId,
      request_id: options?.requestId,
      message,
      agent: "architect",
      mode: options?.mode,
      soul_override: options?.soulOverride,
      ...(options?.forgeSandboxId ? { forge_sandbox_id: options.forgeSandboxId } : {}),
      ...(options?.agentId ? { agent_id: options.agentId } : {}),
    }),
  });
  traceLog(traceId, "fetch.headers", { status: res.status, contentType: res.headers.get("content-type") });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let payload: { error?: string; detail?: string; message?: string } | null = null;
      try {
        payload = (await res.json()) as { error?: string; detail?: string; message?: string };
      } catch {
        payload = null;
      }

      const code = payload?.error ?? null;
      const detail = payload?.detail ?? payload?.message ?? "Bridge request failed.";
      const prefix =
        res.status === 401 || res.status === 403 || code === "forbidden_origin" || code === "auth_unavailable"
          ? "Bridge auth error:"
          : "Bridge API error:";
      throw new BridgeApiError(res.status, `${prefix} ${detail}`, code);
    }

    const error = await res.text();
    throw new BridgeApiError(res.status, `Bridge API error: ${res.status} ${error}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from bridge API");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ArchitectResponse | null = null;
  let accumulatedDeltaText = "";
  const timeoutMs = options?.readTimeoutMs ?? DEFAULT_SSE_READ_TIMEOUT_MS;

  const handleEventBlock = (eventBlock: string) => {
    if (!eventBlock.trim()) return;

    let eventName = "";
    const eventDataLines: string[] = [];

    for (const line of eventBlock.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        eventDataLines.push(line.slice(6));
      }
    }

    const eventData = eventDataLines.join("\n");

    if (!eventName || !eventData) return;

    try {
      const parsed = JSON.parse(eventData);
      traceLog(traceId, `sse.${eventName}`, eventName === "delta"
        ? { len: (parsed.text || "").length }
        : eventName === "result"
          ? { type: parsed?.type, contentLen: (parsed?.content || "").length }
          : parsed);

      if (eventName === "status") {
        callbacks?.onStatus?.(parsed.phase, parsed.message);
      } else if (
        eventName === "approval_required" ||
        eventName === "approval_denied" ||
        eventName === "approval_auto_allowed"
      ) {
        callbacks?.onApprovalEvent?.(parsed as ApprovalEvent);
        if (typeof parsed.message === "string") {
          callbacks?.onStatus?.(eventName, parsed.message);
        }
      } else if (eventName === "delta") {
        callbacks?.onDelta?.(parsed.text as string);
        accumulatedDeltaText += parsed.text;
      } else if (eventName === "intermediate") {
        callbacks?.onIntermediate?.(parsed as IntermediateUpdate);
      } else if (eventName === "result") {
        finalResult = parsed as ArchitectResponse;
      } else if (
        eventName === "file_written" ||
        eventName === "skill_created" ||
        eventName === "build_progress" ||
        eventName === "workspace_changed" ||
        eventName === "tool_start" ||
        eventName === "tool_end"
      ) {
        callbacks?.onCustomEvent?.(eventName, parsed);
      }
    } catch {
      console.warn(
        "[SSE] Failed to parse event data:",
        eventData.slice(0, 200)
      );
    }
  };

  try {
    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`SSE read timed out after ${timeoutMs}ms`)), timeoutMs)
          ),
        ]);
      } catch (timeoutErr) {
        traceLog(traceId, "sse.read.error", {
          message: (timeoutErr as Error)?.message,
          accumulatedDeltaLen: accumulatedDeltaText.length,
          signalAborted: options?.signal?.aborted ?? false,
          signalReason: options?.signal?.aborted ? String(options.signal?.reason ?? "unknown") : null,
        });
        // If we have partial data, treat as stream end rather than hard error
        if (accumulatedDeltaText) {
          console.warn("[SSE] Read timed out, returning partial response from accumulated deltas");
          break;
        }
        throw timeoutErr;
      }
      const { done, value } = readResult;
      if (done) {
        traceLog(traceId, "sse.done", {
          hasFinalResult: !!finalResult,
          accumulatedDeltaLen: accumulatedDeltaText.length,
          bufferLen: buffer.length,
        });
        break;
      }

      buffer += normalizeSseChunk(decoder.decode(value, { stream: true }));

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        handleEventBlock(eventBlock);
      }
    }

    handleEventBlock(normalizeSseChunk(buffer));
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    if (accumulatedDeltaText) {
      console.warn("[SSE] Stream ended without result event — treating as error with partial content");
      throw new Error(`Agent response incomplete: stream ended without a result event. Partial content: ${accumulatedDeltaText.slice(0, 200)}`);
    }
    throw new Error("SSE stream ended without a result event");
  }

  return finalResult;
}

/**
 * Send a message to a forge sandbox via the HTTP chat proxy.
 * Uses the backend's /api/sandboxes/:id/chat endpoint which bypasses
 * the WebSocket control UI device-identity auth requirement.
 */
export async function sendToForgeSandboxChat(
  sandboxId: string,
  sessionId: string,
  message: string,
  callbacks?: StreamCallbacks,
  options?: { signal?: AbortSignal; systemInstruction?: string; readTimeoutMs?: number },
): Promise<ArchitectResponse> {
  const res = await fetch("/api/openclaw/forge-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify({
      sandbox_id: sandboxId,
      session_id: sessionId,
      message,
      ...(options?.systemInstruction ? { system_instruction: options.systemInstruction } : {}),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Forge chat error: ${res.status} ${error}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from forge chat");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ArchitectResponse | null = null;
  let accumulatedDeltaText = "";
  const timeoutMs = options?.readTimeoutMs ?? DEFAULT_SSE_READ_TIMEOUT_MS;

  const handleEventBlock = (eventBlock: string) => {
    if (!eventBlock.trim()) return;

    let eventName = "";
    const eventDataLines: string[] = [];

    for (const line of eventBlock.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        eventDataLines.push(line.slice(6));
      }
    }

    const eventData = eventDataLines.join("\n");
    if (!eventName || !eventData) return;

    try {
      const parsed = JSON.parse(eventData);
      if (eventName === "status") {
        callbacks?.onStatus?.(parsed.phase, parsed.message);
      } else if (eventName === "delta") {
        callbacks?.onDelta?.(parsed.text as string);
        accumulatedDeltaText += parsed.text;
      } else if (eventName === "intermediate") {
        callbacks?.onIntermediate?.(parsed as IntermediateUpdate);
      } else if (eventName === "result") {
        finalResult = parsed as ArchitectResponse;
      } else if (
        eventName === "file_written" ||
        eventName === "skill_created" ||
        eventName === "build_progress" ||
        eventName === "workspace_changed" ||
        eventName === "tool_start" ||
        eventName === "tool_end"
      ) {
        callbacks?.onCustomEvent?.(eventName, parsed);
      }
    } catch {
      // Skip malformed events
    }
  };

  try {
    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`SSE read timed out after ${timeoutMs}ms`)), timeoutMs)
          ),
        ]);
      } catch (timeoutErr) {
        if (accumulatedDeltaText) {
          console.warn("[SSE] Forge stream read timed out, returning partial response from accumulated deltas");
          break;
        }
        throw timeoutErr;
      }
      const { done, value } = readResult;
      if (done) break;
      buffer += normalizeSseChunk(decoder.decode(value, { stream: true }));
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const eventBlock of events) {
        handleEventBlock(eventBlock);
      }
    }
    handleEventBlock(normalizeSseChunk(buffer));
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    if (accumulatedDeltaText) {
      console.warn("[SSE] Forge stream ended without result event — treating as error with partial content");
      throw new Error(`Forge chat response incomplete: stream ended without a result event. Partial content: ${accumulatedDeltaText.slice(0, 200)}`);
    }
    throw new Error("Forge chat stream ended without a result event");
  }

  return finalResult;
}
