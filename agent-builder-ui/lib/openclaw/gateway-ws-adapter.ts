/**
 * Gateway WebSocket adapter — provides the same streaming callback interface
 * as sendToArchitectStreaming() but uses the backend WS proxy instead of
 * the HTTP /api/openclaw SSE bridge.
 *
 * This adapter translates OpenClaw gateway WS frames into the callback
 * interface that generate-skills.ts and other consumers already use.
 */

import type { ArchitectResponse } from "./types";
import { buildGatewaySessionKey, buildGatewayUserMessage, type OpenClawRequestMode } from "./test-mode";

const BACKEND_WS_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/^http/, "ws");

const CONNECTION_TIMEOUT_MS = 15_000;
const RESPONSE_TIMEOUT_MS = 180_000;

interface StreamCallbacks {
  onStatus?: (phase: string, message: string) => void;
  onDelta?: (text: string) => void;
  onCustomEvent?: (name: string, data: unknown) => void;
  onIntermediate?: (response: ArchitectResponse) => void;
}

interface StreamOptions {
  forgeSandboxId: string;
  mode?: OpenClawRequestMode;
  agentId?: string;
  soulOverride?: string;
}

/**
 * Send a message to the architect via the backend WS proxy.
 * Returns the final ArchitectResponse, same as sendToArchitectStreaming.
 */
export async function sendViaGatewayProxy(
  sessionId: string,
  message: string,
  callbacks: StreamCallbacks,
  options: StreamOptions,
): Promise<ArchitectResponse> {
  const { forgeSandboxId, mode = "copilot", agentId = "architect", soulOverride } = options;

  return new Promise<ArchitectResponse>((resolve, reject) => {
    const url = `${BACKEND_WS_URL}/ws/gateway/${forgeSandboxId}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(new Error(`Failed to open WebSocket: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    let proxyReady = false;
    let chatSent = false;
    let agentText = "";
    let finalResult: ArchitectResponse | null = null;
    let resolved = false;

    const connectionTimeout = setTimeout(() => {
      if (!proxyReady) {
        cleanup();
        reject(new Error("Gateway proxy connection timed out"));
      }
    }, CONNECTION_TIMEOUT_MS);

    const responseTimeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        if (agentText) {
          reject(new Error(`Gateway response timed out after ${RESPONSE_TIMEOUT_MS / 1000}s. Partial: ${agentText.slice(0, 200)}`));
        } else {
          reject(new Error(`Gateway response timed out after ${RESPONSE_TIMEOUT_MS / 1000}s`));
        }
      }
    }, RESPONSE_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(connectionTimeout);
      clearTimeout(responseTimeout);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const resolveOnce = (response: ArchitectResponse) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(response);
    };

    const rejectOnce = (err: Error) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(err);
    };

    ws.onmessage = (event) => {
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }

      // 1. Proxy is ready — send the chat message
      if (frame.type === "proxy_ready") {
        proxyReady = true;
        clearTimeout(connectionTimeout);
        callbacks.onStatus?.("authenticated", "Agent started...");

        // Send chat.send
        const sessionKey = buildGatewaySessionKey(agentId, sessionId, mode);
        const chatMessage = buildGatewayUserMessage(message, { mode, soulOverride });

        ws.send(JSON.stringify({
          type: "req",
          id: "2",
          method: "chat.send",
          params: {
            sessionKey,
            message: chatMessage,
            idempotencyKey: `req-${Date.now()}`,
            deliver: false,
          },
        }));
        chatSent = true;
        return;
      }

      // 2. Response to chat.send — chat accepted
      if (frame.type === "res" && frame.id === "2") {
        if (!frame.ok) {
          rejectOnce(new Error(`Chat rejected: ${JSON.stringify(frame.error ?? frame.payload)}`));
          return;
        }
        callbacks.onStatus?.("thinking", "Agent thinking...");
        return;
      }

      // 3. Gateway events — translate to callbacks
      if (frame.type === "event") {
        const eventName = frame.event as string;
        const payload = (frame.payload ?? frame.data ?? frame) as Record<string, unknown>;

        switch (eventName) {
          // Text streaming
          case "agent.turn.chunk": {
            const text = (payload.text ?? payload.content ?? "") as string;
            if (text) {
              agentText += text;
              callbacks.onDelta?.(text);
            }
            break;
          }

          // Agent response complete
          case "agent.turn.done": {
            const content = (payload.content ?? payload.text ?? agentText) as string;
            // Try to parse as structured response (JSON in content)
            finalResult = parseAgentResponse(content);
            resolveOnce(finalResult);
            break;
          }

          // Tool execution
          case "tool_start":
          case "tool.start": {
            const toolName = (payload.tool ?? payload.name ?? "unknown") as string;
            callbacks.onStatus?.("tool", `Using: ${toolName}`);
            callbacks.onCustomEvent?.("tool_start", payload);
            break;
          }

          case "tool_end":
          case "tool.end": {
            callbacks.onCustomEvent?.("tool_end", payload);
            break;
          }

          // File operations
          case "file_written":
          case "file.written": {
            callbacks.onCustomEvent?.("file_written", payload);
            break;
          }

          // Skill creation
          case "skill_created":
          case "skill.created": {
            callbacks.onCustomEvent?.("skill_created", payload);
            break;
          }

          // Build progress
          case "build_progress":
          case "build.progress": {
            callbacks.onCustomEvent?.("build_progress", payload);
            break;
          }

          // Status updates
          case "status":
          case "agent.status": {
            const phase = (payload.phase ?? "working") as string;
            const msg = (payload.message ?? "") as string;
            callbacks.onStatus?.(phase, msg);
            break;
          }

          // Approval events
          case "approval_required":
          case "approval_auto_allowed":
          case "approval_denied": {
            callbacks.onCustomEvent?.(eventName, payload);
            break;
          }

          // Workspace events
          case "workspace_changed": {
            callbacks.onCustomEvent?.("workspace_changed", payload);
            break;
          }

          default:
            // Forward unknown events as custom events
            if (eventName) {
              callbacks.onCustomEvent?.(eventName, payload);
            }
        }
        return;
      }

      // 4. Run completion (alternative signal)
      if (frame.type === "event" && frame.event === "run.complete") {
        if (!resolved) {
          finalResult = parseAgentResponse(agentText);
          resolveOnce(finalResult);
        }
      }
    };

    ws.onerror = () => {
      // onclose fires after this
    };

    ws.onclose = (event) => {
      if (!resolved) {
        if (agentText && !finalResult) {
          // Agent produced text but didn't send turn.done — treat as complete
          finalResult = parseAgentResponse(agentText);
          resolveOnce(finalResult);
        } else if (!agentText) {
          rejectOnce(
            new Error(
              event.reason
                ? `Gateway closed: ${event.reason}`
                : `Gateway connection closed (code ${event.code})`,
            ),
          );
        }
      }
    };
  });
}

/**
 * Parse raw agent text into a structured ArchitectResponse.
 * Handles: ready_for_review JSON, architecture_plan JSON, plain text.
 */
function parseAgentResponse(text: string): ArchitectResponse {
  // Try to extract JSON from the response
  const jsonPatterns = [
    /```(?:ready_for_review|json)\s*\n([\s\S]*?)\n```/,
    /\{[\s\S]*"type"\s*:\s*"ready_for_review"[\s\S]*\}/,
    /\{[\s\S]*"type"\s*:\s*"architecture_plan"[\s\S]*\}/,
    /\{[\s\S]*"skill_graph"[\s\S]*\}/,
  ];

  for (const pattern of jsonPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const json = JSON.parse(match[1] ?? match[0]);
        return json as ArchitectResponse;
      } catch {
        // Continue to next pattern
      }
    }
  }

  // Fallback: return as plain agent response
  return { type: "agent_response", content: text } as ArchitectResponse;
}
