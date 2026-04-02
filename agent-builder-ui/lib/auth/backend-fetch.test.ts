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

// Restore original fetch after all tests
globalThis.fetch = originalFetch;
