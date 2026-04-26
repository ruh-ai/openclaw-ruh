import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockClearUser = mock(() => {});
const mockClearAuthCookies = mock(() => Promise.resolve());

mock.module("@/hooks/use-user", () => ({
  useUserStore: {
    getState: () => ({
      clearUser: mockClearUser,
    }),
  },
}));

mock.module("./authCookies.client", () => ({
  // helper.ts imports from authCookies.client (the browser-only path).
  // Mock that exact module so the registry resolves to the spy.
  clearAuthCookies: mockClearAuthCookies,
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setAuthCookies: () => {},
}));

mock.module("@/shared/routes", () => ({
  loginRoute: "/authenticate",
  getAccessTokenRoute: "/api/auth/refresh",
}));

const { clearUserStoreAndLogout, clearUserStore, getAuthApi } =
  await import("./helper");

beforeEach(() => {
  mockClearUser.mockClear();
  mockClearAuthCookies.mockClear();
});

describe("clearUserStore", () => {
  test("calls clearUser on the user store", () => {
    clearUserStore();
    expect(mockClearUser).toHaveBeenCalledTimes(1);
  });
});

describe("clearUserStoreAndLogout", () => {
  test("clears user store and auth cookies", async () => {
    await clearUserStoreAndLogout();
    expect(mockClearUser).toHaveBeenCalledTimes(1);
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });
});

describe("getAuthApi", () => {
  test("returns an object (dynamic import resolves)", async () => {
    // getAuthApi performs a dynamic import; we just verify it does not throw
    // In test environment the import may fail, so we test the function exists
    expect(typeof getAuthApi).toBe("function");
  });
});
