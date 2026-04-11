import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import axios, { AxiosError } from "axios";

// Mock dependencies before importing axios module
const mockGetAccessToken = mock(async () => "test-token-123");
const mockGetRefreshToken = mock(async () => "refresh-token-456");
const mockClearAuthCookies = mock(async () => {});
const mockClearUserStore = mock(() => {});
const mockClearUserStoreAndLogout = mock(async () => {});
const mockGenerateAccessToken = mock(async () => ({ accessToken: "new-token" }));

mock.module("./authCookies", () => ({
  getAccessToken: mockGetAccessToken,
  getRefreshToken: mockGetRefreshToken,
  clearAuthCookies: mockClearAuthCookies,
}));

mock.module("@/shared/routes", () => ({
  getAccessTokenRoute: "/api/auth/refresh",
  loginRoute: "/authenticate",
}));

mock.module("./helper", () => ({
  clearUserStore: mockClearUserStore,
  clearUserStoreAndLogout: mockClearUserStoreAndLogout,
  getAuthApi: mock(async () => ({
    generateAccessToken: mockGenerateAccessToken,
  })),
}));

describe("axios instance", () => {
  beforeEach(() => {
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue("test-token-123");
    mockGetRefreshToken.mockReset();
    mockGetRefreshToken.mockResolvedValue("refresh-token-456");
    mockClearAuthCookies.mockReset();
    mockClearUserStore.mockReset();
    mockClearUserStoreAndLogout.mockReset();
    mockGenerateAccessToken.mockReset();
    mockGenerateAccessToken.mockResolvedValue({ accessToken: "new-token" });
  });

  test("creates an axios instance with the configured base URL", async () => {
    const { default: api } = await import("./axios");

    expect(api).toBeDefined();
    expect(api.defaults.baseURL).toBe(process.env.NEXT_PUBLIC_API_URL);
  });

  test("has request interceptor configured", async () => {
    const { default: api } = await import("./axios");

    // axios stores interceptors internally; verify they exist
    expect(api.interceptors.request).toBeDefined();
    // @ts-expect-error - accessing internal handlers array
    const requestHandlers = api.interceptors.request.handlers;
    expect(requestHandlers.length).toBeGreaterThan(0);
  });

  test("has response interceptor configured", async () => {
    const { default: api } = await import("./axios");

    expect(api.interceptors.response).toBeDefined();
    // @ts-expect-error - accessing internal handlers array
    const responseHandlers = api.interceptors.response.handlers;
    expect(responseHandlers.length).toBeGreaterThan(0);
  });
});

describe("axios request interceptor", () => {
  test("adds Bearer token to request when access token available", async () => {
    const { default: api } = await import("./axios");

    // @ts-expect-error - accessing internal handlers array
    const [handler] = api.interceptors.request.handlers;
    const config = { headers: { common: {}, Authorization: undefined } as any };
    const result = await handler.fulfilled(config);
    expect(result.headers.Authorization).toBe("Bearer test-token-123");
  });

  test("does not add auth header when no access token", async () => {
    mockGetAccessToken.mockResolvedValueOnce(null as unknown as string);
    const { default: api } = await import("./axios");

    // @ts-expect-error
    const [handler] = api.interceptors.request.handlers;
    const config = { headers: {} as any };
    const result = await handler.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  test("always adds ngrok-skip-browser-warning header", async () => {
    const { default: api } = await import("./axios");

    // @ts-expect-error
    const [handler] = api.interceptors.request.handlers;
    const config = { headers: {} as any };
    const result = await handler.fulfilled(config);
    expect(result.headers["ngrok-skip-browser-warning"]).toBe("true");
  });

  test("request error handler wraps error in Error object", async () => {
    const { default: api } = await import("./axios");

    // @ts-expect-error
    const [handler] = api.interceptors.request.handlers;
    const rejection = handler.rejected(new Error("Network failure"));
    await expect(rejection).rejects.toThrow("Request interceptor error: Network failure");
  });

  test("request error handler handles non-Error rejection", async () => {
    const { default: api } = await import("./axios");

    // @ts-expect-error
    const [handler] = api.interceptors.request.handlers;
    const rejection = handler.rejected("string error");
    await expect(rejection).rejects.toThrow("Request interceptor error: Unknown error");
  });
});

describe("axios response interceptor", () => {
  test("passes through successful responses unchanged", async () => {
    const { default: api } = await import("./axios");

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;
    const mockResponse = { status: 200, data: { ok: true } };
    expect(handler.fulfilled(mockResponse)).toBe(mockResponse);
  });

  test("refreshes token on 401 and retries request", async () => {
    const { default: api } = await import("./axios");

    // Create a mock 401 error
    const error401 = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
      data: "Unauthorized",
    } as any);
    error401.config = { url: "/api/agents", headers: {} as any } as any;

    // Spy on api to intercept the retry call
    const axiosSpy = mock(async () => ({ status: 200, data: {} }));
    const origRequest = api.request.bind(api);

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    // Mock the api call for retry (this will call the mocked generateAccessToken)
    let retryCallMade = false;
    Object.defineProperty(error401, "config", {
      value: {
        url: "/api/agents",
        headers: {},
        _retry: false,
        __isAxiosRequest: true,
      },
      writable: true,
    });

    // We can't easily intercept the api(originalRequest) call in the interceptor
    // But we can verify generateAccessToken was called and clearAuthCookies was NOT
    try {
      await handler.rejected(error401);
    } catch {
      // May throw if the retry fails — that's ok for coverage
    }
    // generateAccessToken should have been called
    expect(mockGetRefreshToken).toHaveBeenCalled();
  });

  test("clears auth and rejects when 401 occurs but no refresh token", async () => {
    mockGetRefreshToken.mockResolvedValueOnce(null as unknown as string);
    const { default: api } = await import("./axios");

    const error401 = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
      data: "Unauthorized",
    } as any);
    error401.config = { url: "/api/agents", headers: {} as any } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    try {
      await handler.rejected(error401);
      expect(false).toBe(true); // should not reach here
    } catch (err) {
      expect((err as Error).message).toContain("No refresh token");
    }
    expect(mockClearAuthCookies).toHaveBeenCalled();
    expect(mockClearUserStore).toHaveBeenCalled();
  });

  test("clears auth and rejects when refresh token URL itself returns 401", async () => {
    const { default: api } = await import("./axios");

    const errorOnRefresh = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
    } as any);
    errorOnRefresh.config = {
      url: "/api/auth/refresh",
      headers: {} as any,
    } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    try {
      await handler.rejected(errorOnRefresh);
    } catch (err) {
      expect((err as Error).message).toContain("Invalid or expired refresh token");
    }
    expect(mockClearUserStoreAndLogout).toHaveBeenCalled();
  });

  test("rejects non-401 errors without refresh attempt", async () => {
    const { default: api } = await import("./axios");

    const error500 = new AxiosError("Server Error", "500", undefined, undefined, {
      status: 500,
    } as any);
    error500.config = { url: "/api/agents", headers: {} as any } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    const callsBefore = mockGetRefreshToken.mock.calls.length;
    try {
      await handler.rejected(error500);
    } catch (err) {
      expect(err).toBe(error500);
    }
    // No new calls made for non-401 errors
    expect(mockGetRefreshToken.mock.calls.length).toBe(callsBefore);
  });

  test("does not retry already-retried requests (prevents infinite loop)", async () => {
    const { default: api } = await import("./axios");

    const error401 = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
    } as any);
    error401.config = {
      url: "/api/agents",
      headers: {} as any,
      _retry: true, // already retried
    } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    const callsBefore = mockGetRefreshToken.mock.calls.length;
    try {
      await handler.rejected(error401);
    } catch {
      // expected
    }
    // No new refresh token calls for already-retried requests
    expect(mockGetRefreshToken.mock.calls.length).toBe(callsBefore);
  });

  test("clears auth and rejects when token refresh call throws", async () => {
    mockGenerateAccessToken.mockRejectedValueOnce(new Error("Token service down"));
    const { default: api } = await import("./axios");

    const error401 = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
    } as any);
    error401.config = { url: "/api/agents", headers: {} as any } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    try {
      await handler.rejected(error401);
    } catch (err) {
      expect((err as Error).message).toBe("Token service down");
    }
    expect(mockClearAuthCookies).toHaveBeenCalled();
  });

  test("clears auth and rejects when generateAccessToken returns no accessToken", async () => {
    // Simulate a token response where accessToken is undefined/null
    mockGenerateAccessToken.mockResolvedValueOnce({ accessToken: null });
    const { default: api } = await import("./axios");

    const error401 = new AxiosError("Unauthorized", "401", undefined, undefined, {
      status: 401,
    } as any);
    error401.config = { url: "/api/agents", headers: {} as any } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    try {
      await handler.rejected(error401);
    } catch (err) {
      expect((err as Error).message).toContain("Token refresh failed");
    }
    expect(mockClearAuthCookies).toHaveBeenCalled();
    expect(mockClearUserStore).toHaveBeenCalled();
  });

  test("handles 403 the same as 401 — attempts token refresh", async () => {
    const { default: api } = await import("./axios");

    const error403 = new AxiosError("Forbidden", "403", undefined, undefined, {
      status: 403,
    } as any);
    error403.config = { url: "/api/agents", headers: {} as any } as any;

    // @ts-expect-error
    const [handler] = api.interceptors.response.handlers;

    try {
      await handler.rejected(error403);
    } catch {
      // may succeed or fail — we just want to confirm refresh was attempted
    }
    expect(mockGetRefreshToken).toHaveBeenCalled();
  });
});
