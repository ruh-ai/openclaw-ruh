import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockCookieStore = {
  get: mock(() => undefined as { value: string } | undefined),
  set: mock(() => {}),
};

mock.module("next/headers", () => ({
  cookies: async () => mockCookieStore,
}));

const {
  getAccessToken,
  getRefreshToken,
  checkAccessToken,
  setAuthCookies,
  clearAuthCookies,
} = await import("./authCookies");

beforeEach(() => {
  mockCookieStore.get.mockReset();
  mockCookieStore.set.mockReset();
});

describe("getAccessToken", () => {
  test("returns the access token value when present", async () => {
    mockCookieStore.get.mockImplementation((name: string) =>
      name === "accessToken" ? { value: "tok-123" } : undefined,
    );
    expect(await getAccessToken()).toBe("tok-123");
  });

  test("returns null when the access token cookie is missing", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getAccessToken()).toBeNull();
  });
});

describe("getRefreshToken", () => {
  test("returns the refresh token value when present", async () => {
    mockCookieStore.get.mockImplementation((name: string) =>
      name === "refreshToken" ? { value: "ref-456" } : undefined,
    );
    expect(await getRefreshToken()).toBe("ref-456");
  });

  test("returns null when the refresh token cookie is missing", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getRefreshToken()).toBeNull();
  });
});

describe("checkAccessToken", () => {
  test("returns true when access token exists", async () => {
    mockCookieStore.get.mockImplementation((name: string) =>
      name === "accessToken" ? { value: "tok-123" } : undefined,
    );
    expect(await checkAccessToken()).toBe(true);
  });

  test("returns false when access token is missing", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await checkAccessToken()).toBe(false);
  });
});

describe("setAuthCookies", () => {
  test("sets both access and refresh token cookies", async () => {
    await setAuthCookies("access-tok", "refresh-tok", 900, 604800);
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    expect(mockCookieStore.set.mock.calls[0][0]).toBe("accessToken");
    expect(mockCookieStore.set.mock.calls[0][1]).toBe("access-tok");
    expect(mockCookieStore.set.mock.calls[1][0]).toBe("refreshToken");
    expect(mockCookieStore.set.mock.calls[1][1]).toBe("refresh-tok");
  });

  test("skips refresh token when null", async () => {
    await setAuthCookies("access-tok", null, 900, null);
    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    expect(mockCookieStore.set.mock.calls[0][0]).toBe("accessToken");
  });
});

describe("clearAuthCookies", () => {
  test("sets both cookies to empty strings with maxAge 0", async () => {
    await clearAuthCookies();
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    expect(mockCookieStore.set.mock.calls[0][0]).toBe("accessToken");
    expect(mockCookieStore.set.mock.calls[0][1]).toBe("");
    expect(mockCookieStore.set.mock.calls[0][2]).toMatchObject({ maxAge: 0 });
    expect(mockCookieStore.set.mock.calls[1][0]).toBe("refreshToken");
    expect(mockCookieStore.set.mock.calls[1][1]).toBe("");
  });
});
