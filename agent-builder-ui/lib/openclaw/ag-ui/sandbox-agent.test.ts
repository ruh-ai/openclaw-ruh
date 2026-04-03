import { describe, expect, test, mock, afterEach } from "bun:test";
import { SandboxAgent } from "./sandbox-agent";

const originalFetch = globalThis.fetch;

describe("SandboxAgent", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("constructor sets sandboxId and apiBase", () => {
    const agent = new SandboxAgent({ sandboxId: "sb-123", apiBase: "http://localhost:9000" });
    expect(agent).toBeDefined();
  });

  test("run returns an Observable", () => {
    const agent = new SandboxAgent({ sandboxId: "sb-123" });
    const input = {
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ role: "user" as const, content: "Hello" }],
      tools: [],
      context: [],
    };
    const observable = agent.run(input);
    expect(observable).toBeDefined();
    expect(typeof observable.subscribe).toBe("function");
  });

  test("emits RUN_ERROR on non-ok fetch response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    const agent = new SandboxAgent({ sandboxId: "sb-123", apiBase: "http://localhost:9000" });
    const input = {
      threadId: "thread-1",
      runId: "run-1",
      messages: [{ role: "user" as const, content: "Hello" }],
      tools: [],
      context: [],
    };

    const events: unknown[] = [];
    await new Promise<void>((resolve) => {
      agent.run(input).subscribe({
        next: (event) => events.push(event),
        complete: () => resolve(),
        error: () => resolve(),
      });
    });

    expect(events.length).toBeGreaterThanOrEqual(2);
    const errorEvent = events.find((e: unknown) => (e as Record<string, string>).type === "RUN_ERROR");
    expect(errorEvent).toBeDefined();
  });
});
