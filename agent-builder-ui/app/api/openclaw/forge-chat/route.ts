import { NextRequest, NextResponse } from "next/server";
import { extractIntermediateUpdates } from "@/lib/openclaw/intermediate-updates";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Extract a ready_for_review structured response from agent text output.
 *
 * The architect may embed the JSON as:
 * 1. ```ready_for_review { ... } ```
 * 2. ```json { "type": "ready_for_review", ... } ```
 * 3. Raw JSON with "type":"ready_for_review"
 *
 * If found, normalizes the skill_graph to the expected { nodes, system_name, workflow } shape.
 * Falls back to agent_response if no structured block is found.
 */
function extractReadyForReview(text: string): Record<string, unknown> {
  // Passthrough types: discovery (Think stage) and architecture_plan (Plan stage)
  // These don't need normalization — they pass through as-is.
  const PASSTHROUGH_TYPES = new Set(["discovery", "architecture_plan"]);

  // Try code-block tagged ready_for_review (covers ready_for_review, discovery, architecture_plan)
  const rfr = text.match(/```ready_for_review\s*\n?([\s\S]*?)```/);
  if (rfr) {
    try {
      const parsed = JSON.parse(rfr[1]) as Record<string, unknown>;
      if (PASSTHROUGH_TYPES.has(parsed.type as string)) {
        return parsed;
      }
      return normalizeReadyForReview(parsed, text);
    } catch { /* fall through */ }
  }

  // Try ```json block with recognized types
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]) as Record<string, unknown>;
      if (PASSTHROUGH_TYPES.has(parsed.type as string)) {
        return parsed;
      }
      if (parsed.type === "ready_for_review") {
        return normalizeReadyForReview(parsed, text);
      }
    } catch { /* fall through */ }
  }

  // Try raw JSON with type: ready_for_review
  const rawJsonRfr = text.match(/\{[\s\S]*"type"\s*:\s*"ready_for_review"[\s\S]*\}/);
  if (rawJsonRfr) {
    try {
      const parsed = JSON.parse(rawJsonRfr[0]) as Record<string, unknown>;
      return normalizeReadyForReview(parsed, text);
    } catch { /* fall through */ }
  }

  // Try raw JSON with passthrough types (discovery, architecture_plan)
  for (const pt of PASSTHROUGH_TYPES) {
    const rawMatch = text.match(new RegExp(`\\{[\\s\\S]*"type"\\s*:\\s*"${pt}"[\\s\\S]*\\}`));
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]) as Record<string, unknown>;
        if (parsed.type === pt) {
          return parsed;
        }
      } catch { /* fall through */ }
    }
  }

  // Fallback: plain text response
  return { type: "agent_response", content: text || "No response from agent." };
}

/**
 * Normalize the ready_for_review response to the shape BuilderAgent expects:
 * - skill_graph must be { system_name, nodes[], workflow? }
 * - If the architect output skill_graph as a flat array, wrap it in { nodes: [...] }
 */
function normalizeReadyForReview(
  parsed: Record<string, unknown>,
  fullText: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...parsed, type: "ready_for_review" };

  // Ensure content includes conversational prose (not just JSON)
  if (!result.content) {
    const prose = fullText.replace(/```[\s\S]*?```/g, "").trim();
    if (prose) result.content = prose;
  }

  // Normalize skill_graph: BuilderAgent expects { system_name, nodes[], workflow? }
  const sg = result.skill_graph;
  if (Array.isArray(sg)) {
    // Architect output skill_graph as a flat array — wrap it
    result.skill_graph = {
      system_name: result.system_name || "agent",
      nodes: sg,
      workflow: result.workflow || null,
    };
  } else if (sg && typeof sg === "object" && !(sg as Record<string, unknown>).nodes) {
    // Object but missing nodes key — check if it has skill-like entries
    const sgObj = sg as Record<string, unknown>;
    if (sgObj.system_name || sgObj.workflow) {
      // Already in the right shape but might be missing nodes
      if (!sgObj.nodes) sgObj.nodes = [];
    }
  }

  return result;
}

/**
 * Extract a JSON object from text by finding a `{` that contains a marker
 * and counting braces to find the matching `}`. Handles nested objects.
 */
function extractJsonByBraceCounting(text: string, marker: string): Record<string, unknown> | null {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;

  // Walk backwards to find the opening `{`
  let startIdx = -1;
  for (let i = markerIdx; i >= 0; i--) {
    if (text[i] === "{") {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  // Walk forward counting braces to find the matching `}`
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonStr = text.slice(startIdx, i + 1);
        try {
          return JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Proxy chat to a specific sandbox via the backend's HTTP chat endpoint.
 *
 * This bypasses the WebSocket control UI auth (which requires device identity)
 * by using the backend's HTTP `/v1/chat/completions` proxy instead.
 *
 * Accepts: { sandbox_id, session_id, message, mode? }
 * Returns: SSE stream with `event: delta` and `event: result` matching /api/openclaw format.
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

    // Build OpenAI-compatible chat request.
    // If a system_instruction is provided, send it as a system message
    // so the sandbox agent treats it as authoritative instruction.
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

    // Forward to backend sandbox chat endpoint (streaming)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (session_id) {
      headers["x-openclaw-session-key"] = `agent:architect:${session_id}`;
    }

    const upstream = await fetch(
      `${BACKEND_URL}/api/sandboxes/${sandbox_id}/chat`,
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

    // Stream the response, converting OpenAI SSE format to our custom format
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
        let lastScanLength = 0;
        const emittedIntermediates = new Set<string>();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                // Capture assistant text deltas
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta) {
                  fullContent += delta;
                  send("delta", { text: delta });
                }
                // Also capture tool call arguments (architect may output JSON via exec/terminal)
                const toolDelta = parsed.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;
                if (typeof toolDelta === "string" && toolDelta) {
                  fullContent += toolDelta;
                }
              } catch {
                // Skip malformed chunks
              }
            }

            // Scan for intermediate updates every ~200 chars of new content
            if (fullContent.length - lastScanLength >= 200) {
              lastScanLength = fullContent.length;
              const updates = extractIntermediateUpdates(fullContent, emittedIntermediates);
              for (const update of updates) {
                send("intermediate", update);
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            send("status", { phase: "error", message: "Stream interrupted" });
          }
        }

        // Final scan for any remaining intermediate updates
        const finalUpdates = extractIntermediateUpdates(fullContent, emittedIntermediates);
        for (const update of finalUpdates) {
          send("intermediate", update);
        }

        // Try to extract structured JSON from the accumulated content.
        // The architect may output via text deltas OR tool call arguments.
        // First try the standard extraction, then fall back to brace-counting.
        let finalResult = extractReadyForReview(fullContent);

        // If standard extraction returned agent_response fallback,
        // try extracting a structured JSON object by brace-counting
        if (finalResult.type === "agent_response" && fullContent.includes('"type"')) {
          const extracted = extractJsonByBraceCounting(fullContent, '"type"');
          if (extracted) {
            if (extracted.type === "discovery" || extracted.type === "architecture_plan") {
              finalResult = extracted;
            } else if (extracted.type === "ready_for_review") {
              finalResult = normalizeReadyForReview(extracted, fullContent);
            }
          }
        }

        console.log("[forge-chat] finalResult.type:", finalResult.type, "fullContent length:", fullContent.length, "has discovery marker:", fullContent.includes('"type": "discovery"') || fullContent.includes('"type":"discovery"'));
        send("result", finalResult);

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
    console.error("[forge-chat] error:", error);
    return NextResponse.json(
      { type: "error", error: "Internal server error" },
      { status: 500 },
    );
  }
}
