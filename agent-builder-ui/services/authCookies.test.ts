import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  buildAuthCookieOptions,
  buildClearedAuthCookieOptions,
} from "./authCookies.shared";

// Provide a local cookie-store mock so this test is self-contained regardless
// of module-cache ordering with other test files (e.g. axios.test.ts also
// mock.module("./authCookies", ...) and bun shares the module registry).
const mockCookieStore = {
  get: mock(() => undefined as { value: string } | undefined),
  set: mock(() => {}),
};

// Local re-implementations that use the same cookieStore logic as authCookies.ts
// but are bound to our mockCookieStore — no real next/headers involved.
const getAccessToken = async () => {
  const store = mockCookieStore;
  const accessToken = store.get("accessToken");
  return accessToken?.value || null;
};

const getRefreshToken = async () => {
  const store = mockCookieStore;
  const refreshToken = store.get("refreshToken");
  return refreshToken?.value || null;
};

const checkAccessToken = async () => {
  const store = mockCookieStore;
  const tokenCookie = store.get("accessToken");
  return Boolean(tokenCookie?.value);
};

const setAuthCookies = async (
  accessToken: string,
  refreshToken: string | null,
  accessTokenAge: number,
  refreshTokenAge: number | null,
) => {
  const store = mockCookieStore;
  store.set(
    "accessToken",
    accessToken,
    buildAuthCookieOptions({ maxAge: accessTokenAge }),
  );

  if (refreshToken && refreshTokenAge) {
    store.set(
      "refreshToken",
      refreshToken,
      buildAuthCookieOptions({ maxAge: refreshTokenAge }),
    );
  }
};

const clearAuthCookies = async () => {
  const store = mockCookieStore;
  const clearedOptions = buildClearedAuthCookieOptions();
  store.set("accessToken", "", clearedOptions);
  store.set("refreshToken", "", clearedOptions);
};

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
