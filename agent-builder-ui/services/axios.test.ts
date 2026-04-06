import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies before importing axios module
const mockGetAccessToken = mock(async () => "test-token-123");
const mockGetRefreshToken = mock(async () => "refresh-token-456");
const mockClearAuthCookies = mock(async () => {});

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
  clearUserStore: mock(() => {}),
  clearUserStoreAndLogout: mock(async () => {}),
  getAuthApi: mock(async () => ({
    generateAccessToken: mock(async () => ({ accessToken: "new-token" })),
  })),
}));

describe("axios instance", () => {
  beforeEach(() => {
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue("test-token-123");
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
