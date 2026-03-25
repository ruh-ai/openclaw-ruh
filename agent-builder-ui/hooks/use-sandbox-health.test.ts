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
});
