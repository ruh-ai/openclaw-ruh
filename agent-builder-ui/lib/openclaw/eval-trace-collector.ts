/**
 * eval-trace-collector.ts — Collects execution traces from the real agent container.
 *
 * Wraps `sendToForgeSandboxChat()` to capture tool call events alongside the
 * text response, producing a structured ExecutionTrace for LLM-based scoring.
 *
 * The WebSocket chat endpoint (/api/sandboxes/:id/chat/ws) emits structured
 * SSE data frames with `{ tool, input }` for tool starts and `{ result }` for
 * tool completions. The forge-chat proxy converts these to `tool_start`/`tool_end`
 * custom events. We intercept these via the `onCustomEvent` callback.
 */

import type { ExecutionTrace, ToolCallTrace, SkillGraphNode } from "./types";

export interface TraceCollectorConfig {
  sandboxId: string;
  sessionId: string;
  message: string;
  skillGraph: SkillGraphNode[];
  signal?: AbortSignal;
  /** Optional system instruction prepended to the agent message. */
  systemInstruction?: string;
}

/**
 * Send a message to the real agent container and capture the full execution trace.
 *
 * Returns an ExecutionTrace with the agent's response text, all tool calls made,
 * which skills were activated, errors encountered, and timing data.
 */
export async function collectExecutionTrace(
  config: TraceCollectorConfig,
): Promise<ExecutionTrace> {
  const startTime = Date.now();
  const toolCalls: ToolCallTrace[] = [];
  const errors: string[] = [];
  let response = "";
  let activeToolStart = 0;
  let activeToolName = "";

  try {
    // Use the traced forge-chat endpoint which routes through WebSocket
    // and emits tool_start/tool_end events for execution trace capture.
    const res = await fetch("/api/openclaw/forge-chat-traced", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: config.signal,
      body: JSON.stringify({
        sandbox_id: config.sandboxId,
        session_id: config.sessionId,
        message: config.message,
        ...(config.systemInstruction ? { system_instruction: config.systemInstruction } : {}),
      }),
    });

    if (!res.ok) {
      errors.push(`Traced chat failed: ${res.status}`);
    } else {
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            let eventName = "";
            const dataLines: string[] = [];

            for (const line of eventBlock.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
            }

            if (!eventName || dataLines.length === 0) continue;

            try {
              const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;

              if (eventName === "delta") {
                response += (payload.text as string) || "";
              } else if (eventName === "tool_start") {
                activeToolName = (payload.tool as string) || "unknown";
                activeToolStart = Date.now();
                toolCalls.push({
                  toolName: activeToolName,
                  input: (payload.input as string) || "",
                  output: "",
                  durationMs: 0,
                });
              } else if (eventName === "tool_end") {
                const last = toolCalls[toolCalls.length - 1];
                if (last && last.toolName === activeToolName) {
                  last.output = (payload.result as string) || "";
                  last.durationMs = Date.now() - activeToolStart;
                }
                activeToolName = "";
              } else if (eventName === "result") {
                const content = payload.content as string;
                if (content && content.length > response.length) {
                  response = content;
                }
              } else if (eventName === "status" && payload.phase === "error") {
                errors.push((payload.message as string) || "Unknown error");
              }
            } catch {
              // Skip malformed events
            }
          }
        }
        reader.releaseLock();
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Detect which skills were activated by checking if skill IDs or names
  // appear in the response or tool call inputs/outputs
  const skillsActivated = detectSkillsActivated(config.skillGraph, response, toolCalls);

  return {
    response,
    toolCalls,
    skillsActivated,
    errors,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Detect which skills the agent activated by looking for skill IDs and names
 * in the response text and tool call data.
 */
function detectSkillsActivated(
  skillGraph: SkillGraphNode[],
  response: string,
  toolCalls: ToolCallTrace[],
): string[] {
  const activated = new Set<string>();
  const searchText = [
    response,
    ...toolCalls.map((tc) => `${tc.toolName} ${tc.input} ${tc.output}`),
  ].join(" ").toLowerCase();

  for (const skill of skillGraph) {
    const nameNorm = skill.name.toLowerCase();
    const idNorm = skill.skill_id.toLowerCase();
    if (searchText.includes(idNorm) || searchText.includes(nameNorm)) {
      activated.add(skill.skill_id);
    }
  }

  return Array.from(activated);
}
