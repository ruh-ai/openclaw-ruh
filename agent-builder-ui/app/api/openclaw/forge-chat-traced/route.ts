import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Traced forge-chat proxy for agent evaluation.
 *
 * Unlike the standard forge-chat endpoint which uses the HTTP chat proxy,
 * this endpoint uses the WebSocket-based chat proxy (`/chat/ws`) which
 * surfaces `tool_start` and `tool_end` events for every tool call.
 *
 * The trace collector (`eval-trace-collector.ts`) uses these events to
 * build execution traces for LLM-based scoring.
 *
 * Accepts: { sandbox_id, session_id, message, system_instruction? }
 * Returns: SSE stream with `delta`, `tool_start`, `tool_end`, `result` events.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sandbox_id, session_id, message, system_instruction } = body;

    if (!sandbox_id || !message) {
      return NextResponse.json(
        { error: "sandbox_id and message are required" },
        { status: 400 },
      );
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    if (system_instruction) {
      messages.push({ role: "system", content: system_instruction });
    }
    messages.push({ role: "user", content: message });

    const chatBody = {
      model: "openclaw",
      messages,
      stream: true,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (session_id) {
      headers["x-openclaw-session-key"] = `agent:eval:${session_id}`;
    }

    // Use the WebSocket-based chat endpoint which emits tool events
    const upstream = await fetch(
      `${BACKEND_URL}/api/sandboxes/${sandbox_id}/chat/ws`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(chatBody),
        signal: req.signal,
      },
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json(
        { error: `Backend returned ${upstream.status}: ${errText}` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No response body" }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: object) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Controller closed
          }
        };

        send("status", { phase: "thinking", message: "Agent thinking..." });

        let buffer = "";
        let fullContent = "";
        let activeToolName = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              // Handle SSE events from the WS proxy
              if (line.startsWith("event: ")) {
                // SSE event lines are handled below with data lines
                continue;
              }

              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);

                // Standard OpenAI delta format
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta) {
                  fullContent += delta;
                  send("delta", { text: delta });
                }

                // Tool start event: { tool: "toolName", input: "..." }
                if (parsed.tool && !parsed.result) {
                  activeToolName = parsed.tool as string;
                  send("tool_start", {
                    tool: parsed.tool,
                    input: parsed.input || "",
                  });
                }

                // Tool end event: { result: "Completed: toolName" }
                if (parsed.result && typeof parsed.result === "string" && activeToolName) {
                  send("tool_end", {
                    tool: activeToolName,
                    result: parsed.result,
                  });
                  activeToolName = "";
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            send("status", { phase: "error", message: "Stream interrupted" });
          }
        }

        // Emit final result
        send("result", {
          type: "agent_response",
          content: fullContent || "No response from agent.",
        });

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
    console.error("[forge-chat-traced] error:", error);
    return NextResponse.json(
      { type: "error", error: "Internal server error" },
      { status: 500 },
    );
  }
}
