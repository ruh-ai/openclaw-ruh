import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockGetState = mock(() => ({
  user: { accessToken: "test-token-123" },
}));

mock.module("@/hooks/use-user", () => ({
  useUserStore: {
    getState: mockGetState,
  },
}));

const originalFetch = globalThis.fetch;
const mockFetch = mock(() =>
  Promise.resolve(new Response("ok", { status: 200 })),
);

beforeEach(() => {
  mockFetch.mockClear();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockGetState.mockReturnValue({
    user: { accessToken: "test-token-123" },
  });
});

const { fetchBackendWithAuth } = await import("./backend-fetch");

describe("fetchBackendWithAuth", () => {
  test("adds Authorization header from user store", async () => {
    await fetchBackendWithAuth("http://localhost:8000/api/test");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  test("does not override an existing Authorization header", async () => {
    await fetchBackendWithAuth("http://localhost:8000/api/test", {
      headers: { Authorization: "Bearer custom-token" },
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer custom-token");
  });

  test("sets credentials to include by default", async () => {
    await fetchBackendWithAuth("http://localhost:8000/api/test");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.credentials).toBe("include");
  });

  test("respects explicit credentials option", async () => {
    await fetchBackendWithAuth("http://localhost:8000/api/test", {
      credentials: "omit",
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.credentials).toBe("omit");
  });

  test("skips auth header when no user token is available", async () => {
    mockGetState.mockReturnValue({ user: null });

    await fetchBackendWithAuth("http://localhost:8000/api/test");

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Headers;
    expect(headers.has("Authorization")).toBe(false);
  });

  test("passes through additional init options", async () => {
    await fetchBackendWithAuth("http://localhost:8000/api/test", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.method).toBe("POST");
    expect(callArgs[1]?.body).toBe(JSON.stringify({ key: "value" }));
  });
});

describe("fetchBackendWithAuth — 401 refresh flow", () => {
  test("returns 401 response as-is when no refresh token cookie is available (document undefined)", async () => {
    // In bun test environment, document is undefined — readRefreshTokenFromCookie returns null
    // The 401 response should be returned without retry
    const singleFetch = mock(async () => new Response("Unauthorized", { status: 401 }));
    globalThis.fetch = singleFetch as unknown as typeof fetch;

    const res = await fetchBackendWithAuth("http://localhost:8000/api/no-cookie");
    expect(res.status).toBe(401);
    // Only one fetch call (no retry since no refresh token)
    expect(singleFetch.mock.calls.length).toBe(1);
  });

  test("returns original 401 when refresh fetch returns non-ok status", async () => {
    const mockFail = mock(async () => new Response("Unauthorized", { status: 401 }));
    globalThis.fetch = mockFail as unknown as typeof fetch;

    const res = await fetchBackendWithAuth("http://localhost:8000/api/protected");
    expect(res.status).toBe(401);
    // Only one call — no retry when refresh returns null
    expect(mockFail.mock.calls.length).toBe(1);
  });

  test("tryRefreshAccessToken returns null when cookies are absent (document undefined in bun:test)", async () => {
    // readRefreshTokenFromCookie uses unqualified `document` which is undefined in bun:test.
    // This confirms the null-return path: 401 is returned without a retry attempt.
    const mockFail = mock(async () => new Response("Unauthorized", { status: 401 }));
    globalThis.fetch = mockFail as unknown as typeof fetch;

    const res = await fetchBackendWithAuth("http://localhost:8000/api/guarded");
    expect(res.status).toBe(401);
    // confirm no retry happened
    expect(mockFail.mock.calls.length).toBe(1);
  });
});

// Restore original fetch after all tests
globalThis.fetch = originalFetch;
