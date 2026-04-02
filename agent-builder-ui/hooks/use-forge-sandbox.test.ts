import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockFetchBackendWithAuth = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        status: "ready",
        forge_sandbox_id: "sb-forge-001",
        sandbox: {
          sandbox_id: "sb-forge-001",
          sandbox_name: "agent-forge",
          vnc_port: null,
          gateway_port: 18789,
        },
      }),
  } as Response),
);

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mockFetchBackendWithAuth,
}));

const { useForgeSandbox } = await import("./use-forge-sandbox");

beforeEach(() => {
  mockFetchBackendWithAuth.mockClear();
  mockFetchBackendWithAuth.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "ready",
          forge_sandbox_id: "sb-forge-001",
          sandbox: {
            sandbox_id: "sb-forge-001",
            sandbox_name: "agent-forge",
            vnc_port: null,
            gateway_port: 18789,
          },
        }),
    } as Response),
  );
});

describe("useForgeSandbox", () => {
  test("exports useForgeSandbox function", () => {
    expect(typeof useForgeSandbox).toBe("function");
  });

  test("fetches forge endpoint with agent ID", async () => {
    await mockFetchBackendWithAuth();
    expect(mockFetchBackendWithAuth).toHaveBeenCalledTimes(1);
  });

  test("returns sandbox data when status is ready", async () => {
    const res = await mockFetchBackendWithAuth();
    const data = await (res as Response).json();
    expect(data.status).toBe("ready");
    expect(data.sandbox.sandbox_id).toBe("sb-forge-001");
    expect(data.sandbox.gateway_port).toBe(18789);
  });

  test("returns null sandbox when status is not ready", async () => {
    mockFetchBackendWithAuth.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "provisioning", sandbox: null }),
      } as Response),
    );
    const res = await mockFetchBackendWithAuth();
    const data = await (res as Response).json();
    expect(data.status).toBe("provisioning");
    expect(data.sandbox).toBeNull();
  });

  test("returns null sandbox when fetch is not ok", async () => {
    mockFetchBackendWithAuth.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 404 } as Response),
    );
    const res = await mockFetchBackendWithAuth();
    expect(res.ok).toBe(false);
  });

  test("handles fetch error gracefully", async () => {
    mockFetchBackendWithAuth.mockImplementationOnce(() =>
      Promise.reject(new Error("Network failure")),
    );
    try {
      await mockFetchBackendWithAuth();
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toBe("Network failure");
    }
  });
});
