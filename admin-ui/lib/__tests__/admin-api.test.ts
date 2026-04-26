import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: "ok" }),
  } as Response),
);

beforeEach(() => {
  mockFetch.mockClear();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

const { buildApiUrl, fetchAdminJson, mutateAdminJson, API_URL } = await import(
  "../admin-api"
);

describe("buildApiUrl", () => {
  test("prepends API_URL to path", () => {
    expect(buildApiUrl("/api/test")).toBe(`${API_URL}/api/test`);
  });
});

describe("fetchAdminJson", () => {
  test("sends request with credentials: include", async () => {
    await fetchAdminJson("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/test`);
    expect(init.credentials).toBe("include");
  });

  test("returns parsed JSON on success", async () => {
    const result = await fetchAdminJson<{ data: string }>("/api/ok");
    expect(result).toEqual({ data: "ok" });
  });

  test("adds Content-Type header when body is present", async () => {
    await fetchAdminJson("/api/test", {
      method: "POST",
      body: JSON.stringify({ x: 1 }),
    });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  test("does not add Content-Type when no body", async () => {
    await fetchAdminJson("/api/test");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)?.["Content-Type"],
    ).toBeUndefined();
  });

  test("throws with server message when response is not ok", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Bad request body" }),
      } as unknown as Response),
    );
    await expect(fetchAdminJson("/api/fail")).rejects.toThrow("Bad request body");
  });

  test("throws with detail field from error response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: "Validation failed" }),
      } as unknown as Response),
    );
    await expect(fetchAdminJson("/api/fail")).rejects.toThrow("Validation failed");
  });

  test("throws with error field from error response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      } as unknown as Response),
    );
    await expect(fetchAdminJson("/api/fail")).rejects.toThrow("Internal error");
  });

  test("throws generic message when error JSON parsing fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response),
    );
    await expect(fetchAdminJson("/api/fail")).rejects.toThrow(
      "Request failed (502)",
    );
  });

  test("throws generic message when error body has no known fields", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ unknown: "field" }),
      } as unknown as Response),
    );
    await expect(fetchAdminJson("/api/fail")).rejects.toThrow(
      "Request failed (403)",
    );
  });
});

describe("mutateAdminJson", () => {
  test("sends POST with stringified body", async () => {
    await mutateAdminJson("/api/items", "POST", { name: "test" });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "test" }));
  });

  test("sends PATCH request", async () => {
    await mutateAdminJson("/api/items/1", "PATCH", { name: "updated" });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
  });

  test("sends DELETE without body", async () => {
    await mutateAdminJson("/api/items/1", "DELETE");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
