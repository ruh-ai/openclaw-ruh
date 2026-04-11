import { describe, expect, mock, test } from "bun:test";

import {
  classifySandboxHealth,
  createSandboxHealthPoller,
  fetchSandboxHealthMap,
} from "./use-sandbox-health";

describe("classifySandboxHealth", () => {
  test("treats a running container plus running gateway status as running", () => {
    expect(classifySandboxHealth({ container_running: true, status: "running" })).toBe("running");
  });

  test("treats a stopped container as stopped", () => {
    expect(classifySandboxHealth({ container_running: false, status: "running" })).toBe("stopped");
  });

  test("treats a running container without a healthy gateway signal as unreachable", () => {
    expect(classifySandboxHealth({ container_running: true })).toBe("unreachable");
  });
});

describe("fetchSandboxHealthMap", () => {
  test("maps running, stopped, and unreachable sandbox responses", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/sb-running/status")) {
        return new Response(JSON.stringify({ container_running: true, status: "running" }), { status: 200 });
      }

      if (url.endsWith("/sb-stopped/status")) {
        return new Response(JSON.stringify({ container_running: false }), { status: 200 });
      }

      return new Response("gateway down", { status: 503 });
    });

    const result = await fetchSandboxHealthMap(
      ["sb-running", "sb-stopped", "sb-bad"],
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      "sb-running": "running",
      "sb-stopped": "stopped",
      "sb-bad": "unreachable",
    });
  });
});

describe("classifySandboxHealth — extended cases", () => {
  test("treats undefined container_running with healthy status as running", () => {
    expect(classifySandboxHealth({ status: "ok" })).toBe("running");
  });

  test("treats undefined container_running with unhealthy status as unreachable", () => {
    expect(classifySandboxHealth({ status: "stopped" })).toBe("unreachable");
  });

  test("treats container_running true + ready status as running", () => {
    expect(classifySandboxHealth({ container_running: true, status: "ready" })).toBe("running");
  });

  test("treats container_running true + healthy status as running", () => {
    expect(classifySandboxHealth({ container_running: true, status: "healthy" })).toBe("running");
  });

  test("treats container_running true + unknown status as unreachable", () => {
    expect(classifySandboxHealth({ container_running: true, status: "pending" })).toBe("unreachable");
  });

  test("treats container_running false even with healthy status as stopped", () => {
    expect(classifySandboxHealth({ container_running: false, status: "ok" })).toBe("stopped");
  });
});

describe("fetchSandboxHealthMap — edge cases", () => {
  test("returns empty object when given empty sandboxIds array", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }));
    const result = await fetchSandboxHealthMap([], fetchMock as typeof fetch);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns unreachable when fetch throws a non-abort error", async () => {
    const fetchMock = mock(async () => { throw new Error("Network failure"); });
    const result = await fetchSandboxHealthMap(["sb-1"], fetchMock as typeof fetch);
    expect(result["sb-1"]).toBe("unreachable");
  });

  test("propagates abort error by rethrowing it", async () => {
    const fetchMock = mock(async () => { throw new DOMException("Aborted", "AbortError"); });
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchSandboxHealthMap(["sb-1"], fetchMock as typeof fetch, controller.signal),
    ).rejects.toBeInstanceOf(DOMException);
  });

  test("classifies 200 response with container_running false as stopped", async () => {
    const fetchMock = mock(async () =>
      new Response(JSON.stringify({ container_running: false }), { status: 200 }),
    );
    const result = await fetchSandboxHealthMap(["sb-stopped"], fetchMock as typeof fetch);
    expect(result["sb-stopped"]).toBe("stopped");
  });
});

describe("createSandboxHealthPoller", () => {
  test("aborts in-flight requests when stopped", async () => {
    let capturedSignal: AbortSignal | undefined;

    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => {});
    });

    const onUpdate = mock(() => {});
    const poller = createSandboxHealthPoller({
      sandboxIds: ["sb-1"],
      onUpdate,
      fetchImpl: fetchMock as typeof fetch,
      intervalMs: 60_000,
    });

    poller.start();
    await Promise.resolve();

    expect(onUpdate).toHaveBeenCalledWith({ "sb-1": "loading" });
    expect(capturedSignal?.aborted).toBe(false);

    poller.stop();

    expect(capturedSignal?.aborted).toBe(true);
  });

  test("calls onUpdate with unreachable on non-abort fetch error", async () => {
    const fetchMock = mock(async () => { throw new Error("Connection refused"); });
    const onUpdate = mock(() => {});
    const poller = createSandboxHealthPoller({
      sandboxIds: ["sb-1"],
      onUpdate,
      fetchImpl: fetchMock as typeof fetch,
      intervalMs: 60_000,
    });

    poller.start();
    await new Promise((r) => setTimeout(r, 10));
    poller.stop();

    // Should have been called at least once with loading, then unreachable
    const calls = onUpdate.mock.calls;
    expect(calls.some((call) => (call[0] as Record<string, string>)["sb-1"] === "loading")).toBe(true);
    expect(calls.some((call) => (call[0] as Record<string, string>)["sb-1"] === "unreachable")).toBe(true);
  });

  test("does not call onUpdate after stop even if poll completes", async () => {
    let resolveResponse: (r: Response) => void;
    const fetchMock = mock(async () => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const onUpdate = mock(() => {});
    const poller = createSandboxHealthPoller({
      sandboxIds: ["sb-1"],
      onUpdate,
      fetchImpl: fetchMock as typeof fetch,
      intervalMs: 60_000,
    });

    poller.start();
    poller.stop();

    // Resolve the pending request after stop
    resolveResponse!(new Response(JSON.stringify({ container_running: true, status: "running" }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 10));

    // onUpdate should only have been called once (loading state)
    const nonLoadingCalls = onUpdate.mock.calls.filter(
      (call) => (call[0] as Record<string, string>)["sb-1"] !== "loading",
    );
    expect(nonLoadingCalls.length).toBe(0);
  });
});
