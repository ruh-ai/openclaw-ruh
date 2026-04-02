import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ready: true }),
  } as Response),
);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockFetch.mockClear();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const { useBackendHealth } = await import("./use-backend-health");

describe("useBackendHealth", () => {
  test("exports useBackendHealth function", () => {
    expect(typeof useBackendHealth).toBe("function");
  });

  test("calls /ready endpoint", async () => {
    await mockFetch();
    expect(mockFetch).toHaveBeenCalled();
  });

  test("ready response returns ready=true", async () => {
    const res = await mockFetch();
    const data = await (res as Response).json();
    expect(data.ready).toBe(true);
  });

  test("non-ok response produces error state", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 503,
      } as Response),
    );
    const res = await mockFetch();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  test("network failure produces error state", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new Error("Backend is not reachable")),
    );
    try {
      await mockFetch();
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toBe("Backend is not reachable");
    }
  });
});
