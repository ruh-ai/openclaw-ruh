/**
 * SandboxAgent — AG-UI AbstractAgent wrapping the sandbox chat proxy.
 *
 * Sends messages to POST /api/sandboxes/{id}/chat (SSE) and emits
 * AG-UI events. Replaces agent-chat-transport.ts.
 */

import { Observable } from "rxjs";
import { AbstractAgent } from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import type { BaseEvent, RunAgentInput } from "@ag-ui/core";
import { extractBrowserWorkspaceEvent } from "../browser-workspace";
import { CustomEventName } from "./types";

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function humanizeGatewayError(status: number, text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("econnrefused") || lower.includes("gateway unreachable")) {
    return "The agent sandbox is not responding. It may still be starting up or the container may have stopped.";
  }
  if (status === 503 || lower.includes("service unavailable")) {
    return "Agent gateway is temporarily unavailable. Try again in a moment.";
  }
  if (status === 404 || lower.includes("not found")) {
    return "Sandbox not found. It may have been deleted or not yet created.";
  }
  if (lower.includes("container is not running") || lower.includes("no such container")) {
    return "The sandbox container is not running. Try redeploying the agent.";
  }
  // Fallback: return original but trim it
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

export interface SandboxAgentConfig {
  sandboxId: string;
  apiBase?: string;
}

export class SandboxAgent extends AbstractAgent {
  private sandboxId: string;
  private apiBase: string;

  constructor(config: SandboxAgentConfig) {
    super();
    this.sandboxId = config.sandboxId;
    this.apiBase = config.apiBase ?? DEFAULT_API_BASE;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      const abortController = new AbortController();

      this.runStream(input, observer, abortController).catch((err) => {
        observer.error(err);
      });

      return () => {
        abortController.abort();
      };
    });
  }

  private async runStream(
    input: RunAgentInput,
    observer: { next: (event: BaseEvent) => void; complete: () => void; error: (err: unknown) => void },
    abortController: AbortController,
  ): Promise<void> {
    const threadId = input.threadId;
    const runId = input.runId;

    // Emit run started
    observer.next({
      type: EventType.RUN_STARTED,
      threadId,
      runId,
    } as BaseEvent);

    // Extract conversation ID and model from forwarded props
    const conversationId = input.forwardedProps?.conversationId ?? null;
    const model = input.forwardedProps?.model ?? "openclaw";
    const systemMessages = input.forwardedProps?.systemMessages ?? [];

    // Build the messages payload: system messages + user messages
    const userMessage = input.messages[input.messages.length - 1];
    const chatMessages = [
      ...systemMessages,
      { role: userMessage?.role ?? "user", content: userMessage?.content ?? "" },
    ];

    const res = await fetch(`${this.apiBase}/api/sandboxes/${this.sandboxId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        messages: chatMessages,
        model,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      const friendlyMessage = humanizeGatewayError(res.status, errorText);
      observer.next({
        type: EventType.RUN_ERROR,
        message: friendlyMessage,
      } as BaseEvent);
      observer.complete();
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let stepCounter = 0;
    let currentSSEEvent = "";
    let customToolStepId = -1;
    let lastBrowserTool: string | null = null;
    let lastToolName: string | null = null;
    let lastToolArgs = "";
    const messageId = `msg-${runId}`;

    // Code tool name set (mirrors use-agent-chat CODE_TOOLS)
    const CODE_TOOLS = new Set([
      "file_write", "write_file", "file_str_replace", "str_replace_editor",
      "create_file", "edit_file", "write", "save_file", "code_editor",
      "text_editor", "read_file", "file_read",
    ]);

    // Preview server detection regex
    const PREVIEW_SERVER_RE = /(?:Local:\s+|Server (?:running|listening|started) (?:on|at)\s+|ready (?:on|at)\s+|Listening on (?:port\s+)?|http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):)(\d{4,5})/i;

    // Has the text message been started?
    let textMessageStarted = false;

    // Preview detection from text deltas (covers plan-mode where no TOOL_CALL_RESULT fires)
    let previewTextBuf = "";
    const emittedPreviewPorts = new Set<number>();

    // Reasoning state tracking
    let reasoningStarted = false;
    const reasoningMessageId = `reasoning-${runId}`;

    // OpenAI tool_calls accumulator
    const toolCallBuf: Record<number, { name: string; args: string; toolCallId: string }> = {};

    const emitTextDelta = (delta: string) => {
      if (!textMessageStarted) {
        observer.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        } as BaseEvent);
        textMessageStarted = true;
      }

      // Scan text for preview server URLs (handles plan-mode where tool results aren't emitted)
      previewTextBuf = (previewTextBuf + delta).slice(-200);
      const previewMatch = previewTextBuf.match(PREVIEW_SERVER_RE);
      if (previewMatch) {
        const port = parseInt(previewMatch[1], 10);
        if (port >= 1024 && port <= 65535 && !emittedPreviewPorts.has(port)) {
          emittedPreviewPorts.add(port);
          observer.next({
            type: EventType.CUSTOM,
            name: CustomEventName.PREVIEW_SERVER_DETECTED,
            value: { port },
          } as BaseEvent);
        }
      }

      observer.next({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      } as BaseEvent);
    };

    /** Close an open reasoning sequence if active. */
    const closeReasoning = () => {
      if (reasoningStarted) {
        observer.next({ type: EventType.REASONING_MESSAGE_END, messageId: reasoningMessageId } as BaseEvent);
        observer.next({ type: EventType.REASONING_END } as BaseEvent);
        reasoningStarted = false;
      }
    };

    const finishCustomToolStep = () => {
      if (customToolStepId !== -1) {
        // Emit EDITOR_FILE_CHANGED for code tools
        if (lastToolName && CODE_TOOLS.has(lastToolName.toLowerCase())) {
          const pathMatch = lastToolArgs.match(/"path"\s*:\s*"([^"]+)"/);
          if (pathMatch) {
            observer.next({
              type: EventType.CUSTOM,
              name: CustomEventName.EDITOR_FILE_CHANGED,
              value: { path: pathMatch[1] },
            } as BaseEvent);
          }
        }

        observer.next({
          type: EventType.TOOL_CALL_END,
          toolCallId: `tool-${customToolStepId}`,
        } as BaseEvent);
        observer.next({
          type: EventType.STEP_FINISHED,
          stepName: `tool-${customToolStepId}`,
        } as BaseEvent);
        customToolStepId = -1;
        lastToolName = null;
        lastToolArgs = "";
      }
    };

    // Browser tool name regexes
    const BROWSER_NAV = /^(browser_navigate|navigate|browser_goto|goto|open_url|web_navigate|browser_open|web_browse)$/i;
    const BROWSER_SHOT = /^(browser_screenshot|screenshot|capture_screen|take_screenshot|browser_capture|browser_screen)$/i;
    const BROWSER_ACT = /^(browser_click|browser_type|browser_fill|browser_scroll|browser_hover|browser_press|browser_select|browser_submit|browser_check|browser_uncheck)$/i;

    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) {
            currentSSEEvent = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;

          try {
            const parsed = JSON.parse(raw);

            // ── Route.ts WebSocket bridge named events ──────────────
            if (currentSSEEvent === "tool_start") {
              const toolName = parsed.tool || "tool";
              finishCustomToolStep();
              const id = stepCounter++;
              customToolStepId = id;
              lastToolName = toolName;
              lastToolArgs = typeof parsed.input === "string"
                ? parsed.input
                : parsed.input
                  ? JSON.stringify(parsed.input)
                  : "";
              const toolCallId = `tool-${id}`;
              observer.next({ type: EventType.STEP_STARTED, stepName: toolCallId } as BaseEvent);
              observer.next({
                type: EventType.TOOL_CALL_START,
                toolCallId,
                toolCallName: toolName,
                parentMessageId: messageId,
              } as BaseEvent);
              // Browser tool synthesis from tool name
              if (BROWSER_NAV.test(toolName) || BROWSER_SHOT.test(toolName) || BROWSER_ACT.test(toolName)) {
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.BROWSER_EVENT,
                  value: { type: "action", label: `${toolName}: ${lastToolArgs || ""}`.trim() },
                } as BaseEvent);
              }
              currentSSEEvent = "";
              continue;
            }

            if (currentSSEEvent === "tool_end") {
              finishCustomToolStep();
              currentSSEEvent = "";
              continue;
            }

            if (currentSSEEvent === "delta") {
              const text = parsed.text || "";
              if (text) emitTextDelta(text);
              currentSSEEvent = "";
              continue;
            }

            if (currentSSEEvent === "status") {
              const phase = parsed.phase || "";
              if (phase && phase !== "tool_execution") {
                finishCustomToolStep();
              }
              observer.next({ type: EventType.STEP_STARTED, stepName: phase } as BaseEvent);
              currentSSEEvent = "";
              continue;
            }

            if (currentSSEEvent === "result") {
              // Final response from route.ts — the complete agent response
              finishCustomToolStep();
              closeReasoning();
              const content = parsed.content || parsed.message || (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
              if (content && !textMessageStarted) {
                emitTextDelta(typeof content === "string" ? content : JSON.stringify(content));
              }
              observer.next({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
              observer.next({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
              observer.complete();
              return;
            }

            if (currentSSEEvent === "error") {
              const errMsg = parsed.message || parsed.error || "Gateway error";
              observer.next({
                type: EventType.RUN_ERROR,
                message: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg),
              } as BaseEvent);
              observer.complete();
              return;
            }

            if (currentSSEEvent === "approval_auto_allowed") {
              // Fallback: also create tool steps from approval events
              if (parsed.toolName && customToolStepId === -1) {
                const toolName = parsed.toolName;
                const id = stepCounter++;
                customToolStepId = id;
                lastToolName = toolName;
                lastToolArgs = parsed.summary || "";
                observer.next({ type: EventType.STEP_STARTED, stepName: `tool-${id}` } as BaseEvent);
                observer.next({
                  type: EventType.TOOL_CALL_START,
                  toolCallId: `tool-${id}`,
                  toolCallName: toolName,
                  parentMessageId: messageId,
                } as BaseEvent);
              }
              currentSSEEvent = "";
              continue;
            }

            if (currentSSEEvent === "persistence_error") {
              const persistenceMessage = typeof parsed?.message === "string"
                ? parsed.message
                : "The assistant reply was generated but could not be saved to conversation history.";
              observer.next({
                type: EventType.RUN_ERROR,
                message: persistenceMessage,
              } as BaseEvent);
              currentSSEEvent = "";
              continue;
            }

            // ── Browser workspace events (direct from gateway) ──────
            const browserEvent = extractBrowserWorkspaceEvent(parsed);
            if (browserEvent) {
              observer.next({
                type: EventType.CUSTOM,
                name: CustomEventName.BROWSER_EVENT,
                value: browserEvent,
              } as BaseEvent);
              currentSSEEvent = "";
              continue;
            }

            // ── Custom OpenClaw gateway phase events ────────────────
            if (parsed.phase && !parsed.choices) {
              if (parsed.phase !== "tool_execution") {
                finishCustomToolStep();
              }
              observer.next({
                type: EventType.STEP_STARTED,
                stepName: parsed.phase,
              } as BaseEvent);
              currentSSEEvent = "";
              continue;
            }

            // ── Tool execution events ──────────────────────────────
            if ((parsed.tool || parsed.name) && !parsed.choices) {
              const toolName = parsed.tool || parsed.name || "tool";
              const detail = parsed.input ?? parsed.command ?? parsed.arguments ?? parsed.query ?? parsed.cmd ?? undefined;

              finishCustomToolStep();

              const id = stepCounter++;
              customToolStepId = id;
              lastToolName = toolName;
              lastToolArgs = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
              const toolCallId = `tool-${id}`;

              observer.next({
                type: EventType.STEP_STARTED,
                stepName: toolCallId,
              } as BaseEvent);
              observer.next({
                type: EventType.TOOL_CALL_START,
                toolCallId,
                toolCallName: toolName,
                parentMessageId: messageId,
              } as BaseEvent);

              if (detail) {
                observer.next({
                  type: EventType.TOOL_CALL_ARGS,
                  toolCallId,
                  delta: typeof detail === "string" ? detail : JSON.stringify(detail),
                } as BaseEvent);
              }

              // Browser tool synthesis
              lastBrowserTool = null;
              if (BROWSER_NAV.test(toolName)) {
                const inputObj = parsed.input as Record<string, unknown> | undefined;
                const url = (typeof inputObj?.url === "string" ? inputObj.url : undefined)
                  ?? (typeof detail === "string" && /^https?:\/\//.test(detail) ? detail : undefined);
                if (url) {
                  observer.next({
                    type: EventType.CUSTOM,
                    name: CustomEventName.BROWSER_EVENT,
                    value: { type: "navigation", url, label: url },
                  } as BaseEvent);
                }
              } else if (BROWSER_SHOT.test(toolName)) {
                lastBrowserTool = "screenshot";
              } else if (BROWSER_ACT.test(toolName)) {
                const actionLabel = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : toolName;
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.BROWSER_EVENT,
                  value: { type: "action", label: actionLabel },
                } as BaseEvent);
              }

              currentSSEEvent = "";
              continue;
            }

            // ── Tool result / output events ────────────────────────
            if ((parsed.result !== undefined || parsed.output !== undefined) && !parsed.choices) {
              if (lastBrowserTool === "screenshot") {
                const rawResult = parsed.result ?? parsed.output ?? "";
                const rawStr = typeof rawResult === "string" ? rawResult : "";
                if (rawStr.startsWith("data:image/") || /^https?:\/\//.test(rawStr)) {
                  observer.next({
                    type: EventType.CUSTOM,
                    name: CustomEventName.BROWSER_EVENT,
                    value: { type: "screenshot", url: rawStr, label: "Screenshot" },
                  } as BaseEvent);
                }
                lastBrowserTool = null;
              }

              if (customToolStepId !== -1) {
                const output = parsed.result ?? parsed.output ?? "";
                const outputStr = typeof output === "string" ? output : JSON.stringify(output);
                observer.next({
                  type: EventType.TOOL_CALL_RESULT,
                  toolCallId: `tool-${customToolStepId}`,
                  content: outputStr,
                  role: "tool",
                  messageId: `result-${customToolStepId}`,
                } as BaseEvent);

                // Detect preview/dev server URLs in tool output
                const previewMatch = outputStr.match(PREVIEW_SERVER_RE);
                if (previewMatch) {
                  const port = parseInt(previewMatch[1], 10);
                  if (port >= 1024 && port <= 65535) {
                    observer.next({
                      type: EventType.CUSTOM,
                      name: CustomEventName.PREVIEW_SERVER_DETECTED,
                      value: { port },
                    } as BaseEvent);
                  }
                }

                finishCustomToolStep();
              }
              currentSSEEvent = "";
              continue;
            }

            // ── Standard OpenAI SSE format ─────────────────────────

            // Reasoning / thinking content — emit AG-UI REASONING_* events
            const reasoning =
              parsed?.choices?.[0]?.delta?.reasoning_content ??
              parsed?.choices?.[0]?.delta?.thinking ?? "";
            if (reasoning) {
              if (!reasoningStarted) {
                observer.next({ type: EventType.REASONING_START } as BaseEvent);
                observer.next({
                  type: EventType.REASONING_MESSAGE_START,
                  messageId: reasoningMessageId,
                } as BaseEvent);
                reasoningStarted = true;
              }
              observer.next({
                type: EventType.REASONING_MESSAGE_CONTENT,
                messageId: reasoningMessageId,
                delta: reasoning,
              } as BaseEvent);
            }

            // Text content delta
            const delta = parsed?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              // Close reasoning phase when text content starts
              closeReasoning();
              if (customToolStepId !== -1 && delta.trim() && !delta.startsWith("<function=")) {
                finishCustomToolStep();
              }
              emitTextDelta(delta);
            }

            // OpenAI native tool_calls format
            const toolCalls = parsed?.choices?.[0]?.delta?.tool_calls as
              Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
            if (toolCalls) {
              closeReasoning();
              finishCustomToolStep();

              for (const tc of toolCalls) {
                const idx = tc.index ?? 0;
                if (!toolCallBuf[idx]) {
                  const name = tc.function?.name ?? "tool";
                  const id = stepCounter++;
                  const toolCallId = `tool-${id}`;
                  toolCallBuf[idx] = { name, args: "", toolCallId };
                  observer.next({
                    type: EventType.TOOL_CALL_START,
                    toolCallId,
                    toolCallName: name,
                    parentMessageId: messageId,
                  } as BaseEvent);
                }
                if (tc.function?.arguments) {
                  toolCallBuf[idx].args += tc.function.arguments;
                  observer.next({
                    type: EventType.TOOL_CALL_ARGS,
                    toolCallId: toolCallBuf[idx].toolCallId,
                    delta: tc.function.arguments,
                  } as BaseEvent);
                }
              }
            }

            // Finish tool calls when choice has finish_reason
            const finishReason = parsed?.choices?.[0]?.finish_reason;
            if (finishReason === "tool_calls" || finishReason === "stop") {
              for (const idx of Object.keys(toolCallBuf)) {
                const tc = toolCallBuf[Number(idx)];
                if (tc) {
                  observer.next({
                    type: EventType.TOOL_CALL_END,
                    toolCallId: tc.toolCallId,
                  } as BaseEvent);
                  delete toolCallBuf[Number(idx)];
                }
              }
              finishCustomToolStep();
            }
          } catch { /* partial JSON — skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Close any open reasoning phase before finishing
    closeReasoning();

    // End text message if one was started
    if (textMessageStarted) {
      observer.next({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      } as BaseEvent);
    }

    observer.next({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
    } as BaseEvent);
    observer.complete();
  }
}
