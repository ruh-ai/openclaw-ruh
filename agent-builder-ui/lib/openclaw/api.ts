import { ArchitectResponse } from "./types";

export interface StreamCallbacks {
  onStatus?: (phase: string, message: string) => void;
}

/**
 * Send a message to the OpenClaw architect agent via the bridge API.
 * Consumes the SSE stream and returns the final ArchitectResponse.
 */
export async function sendToArchitectStreaming(
  sessionId: string,
  message: string,
  callbacks?: StreamCallbacks
): Promise<ArchitectResponse> {
  const res = await fetch("/api/openclaw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      agent: "architect",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Bridge API error: ${res.status} ${error}`);
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        let eventName = "";
        let eventData = "";

        for (const line of eventBlock.split("\n")) {
          if (line.startsWith("event: ")) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6);
          }
        }

        if (!eventName || !eventData) continue;

        try {
          const parsed = JSON.parse(eventData);

          if (eventName === "status") {
            callbacks?.onStatus?.(parsed.phase, parsed.message);
          } else if (eventName === "result") {
            finalResult = parsed as ArchitectResponse;
          }
        } catch {
          console.warn(
            "[SSE] Failed to parse event data:",
            eventData.slice(0, 200)
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    throw new Error("SSE stream ended without a result event");
  }

  return finalResult;
}
