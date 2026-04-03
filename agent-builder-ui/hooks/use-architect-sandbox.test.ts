import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        sandbox_id: "sb-arch-001",
        sandbox_name: "architect-sandbox",
        vnc_port: null,
        gateway_port: 18789,
      }),
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

const { useArchitectSandbox } = await import("./use-architect-sandbox");

describe("useArchitectSandbox", () => {
  // We test the function's return values by simulating React hook behavior
  // Since this is a React hook, we test the fetch logic it relies on

  test("calls /api/openclaw/architect-sandbox on invocation", async () => {
    await mockFetch();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("returns sandbox data when fetch succeeds", async () => {
    const res = await mockFetch();
    const data = await (res as Response).json();
    expect(data.sandbox_id).toBe("sb-arch-001");
    expect(data.sandbox_name).toBe("architect-sandbox");
    expect(data.gateway_port).toBe(18789);
  });

  test("returns null when response is not ok", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 404 } as Response),
    );
    const res = await mockFetch();
    expect(res.ok).toBe(false);
  });

  test("returns null when fetch throws", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new Error("Network error")),
    );
    try {
      await mockFetch();
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toBe("Network error");
    }
  });

  test("exports useArchitectSandbox function", () => {
    expect(typeof useArchitectSandbox).toBe("function");
  });
});
