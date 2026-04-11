import { describe, expect, test, mock, beforeEach } from "bun:test";

// We test the module directly - no React rendering needed
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ id: "1", name: "test" }),
  } as Response),
);

describe("admin-api", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  test("buildApiUrl prepends API_URL to path", async () => {
    const { buildApiUrl } = await import("../admin-api");
    const url = buildApiUrl("/api/admin/users");
    expect(url).toContain("/api/admin/users");
    expect(url).toMatch(/^https?:\/\//);
  });

  test("fetchAdminJson resolves with JSON body on 2xx response", async () => {
    const { fetchAdminJson } = await import("../admin-api");
    const result = await fetchAdminJson<{ id: string }>("/api/admin/users");
    expect(result).toEqual({ id: "1", name: "test" });
  });

  test("fetchAdminJson includes credentials: include", async () => {
    const { fetchAdminJson } = await import("../admin-api");
    await fetchAdminJson("/api/admin/users");
    const callInit = (mockFetch.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(callInit.credentials).toBe("include");
  });

  test("fetchAdminJson throws Error with payload.message on non-ok response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Bad request from server" }),
      } as Response),
    );
    const { fetchAdminJson } = await import("../admin-api");
    await expect(fetchAdminJson("/api/admin/users")).rejects.toThrow(
      "Bad request from server",
    );
  });

  test("fetchAdminJson throws Error with payload.detail on non-ok response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: "Validation failed" }),
      } as Response),
    );
    const { fetchAdminJson } = await import("../admin-api");
    await expect(fetchAdminJson("/api/admin/users")).rejects.toThrow(
      "Validation failed",
    );
  });

  test("fetchAdminJson throws Error with payload.error on non-ok response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal server error" }),
      } as Response),
    );
    const { fetchAdminJson } = await import("../admin-api");
    await expect(fetchAdminJson("/api/admin/users")).rejects.toThrow(
      "Internal server error",
    );
  });

  test("fetchAdminJson falls back to generic message when JSON parse fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      } as Response),
    );
    const { fetchAdminJson } = await import("../admin-api");
    await expect(fetchAdminJson("/api/admin/ping")).rejects.toThrow(
      "Request failed (503)",
    );
  });

  test("mutateAdminJson sends JSON-serialized body via fetchAdminJson", async () => {
    const { mutateAdminJson } = await import("../admin-api");
    const body = { role: "admin" };
    await mutateAdminJson("/api/admin/users/u1", "PATCH", body);
    const callInit = (mockFetch.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(callInit.method).toBe("PATCH");
    expect(callInit.body).toBe(JSON.stringify(body));
    expect((callInit.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  test("mutateAdminJson sends DELETE without body", async () => {
    const { mutateAdminJson } = await import("../admin-api");
    await mutateAdminJson("/api/admin/users/u1", "DELETE");
    const callInit = (mockFetch.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(callInit.method).toBe("DELETE");
    expect(callInit.body).toBeUndefined();
  });

  test("mutateAdminJson sends POST with body", async () => {
    const { mutateAdminJson } = await import("../admin-api");
    const body = { action: "restart" };
    await mutateAdminJson("/api/admin/sandboxes/sb-1/restart", "POST", body);
    const callInit = (mockFetch.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(callInit.method).toBe("POST");
    expect(callInit.body).toBe(JSON.stringify(body));
  });
});
