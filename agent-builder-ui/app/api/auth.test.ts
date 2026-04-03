import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies before importing the module under test
const mockPost = mock(() => Promise.resolve({ data: {} }));
mock.module("@/services/axios", () => ({
  default: { post: mockPost, get: mock(() => Promise.resolve({ data: {} })) },
}));

const mockSetAuthCookies = mock(async () => {});
const mockClearAuthCookies = mock(async () => {});
const mockGetRefreshToken = mock(async () => "refresh-token-123");
mock.module("@/services/authCookies", () => ({
  setAuthCookies: mockSetAuthCookies,
  clearAuthCookies: mockClearAuthCookies,
  getRefreshToken: mockGetRefreshToken,
}));

const mockSetUser = mock(() => {});
const mockClearUser = mock(() => {});
mock.module("@/hooks/use-user", () => ({
  useUserStore: {
    getState: () => ({ setUser: mockSetUser, clearUser: mockClearUser }),
  },
}));

mock.module("@/lib/auth/app-access", () => ({
  assertBuilderAppAccess: mock(() => {}),
}));

mock.module("@/lib/auth/tenant-switch", () => ({
  ensureBuilderSurfaceSession: mock(async (session: unknown) => session),
}));

const MOCK_SESSION = {
  user: { id: "u1", email: "test@example.com", displayName: "Test User", role: "developer" },
  accessToken: "access-123",
  refreshToken: "refresh-456",
  platformRole: "user" as const,
  activeOrganization: { id: "org1", name: "Test Org", slug: "test-org", kind: "developer" as const, plan: "pro" },
  activeMembership: null,
  memberships: [],
  appAccess: { admin: false, builder: true, customer: false },
};

describe("authApi", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetAuthCookies.mockReset();
    mockClearAuthCookies.mockReset();
    mockSetUser.mockReset();
    mockClearUser.mockReset();
  });

  test("login calls POST /api/auth/login and persists session", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

    const { authApi } = await import("./auth");
    const result = await authApi.login("test@example.com", "password123");

    expect(mockPost).toHaveBeenCalledWith("/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    expect(result.user.email).toBe("test@example.com");
    expect(mockSetAuthCookies).toHaveBeenCalled();
    expect(mockSetUser).toHaveBeenCalled();
  });

  test("login throws on API error", async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { message: "Invalid credentials" } },
    });

    const { authApi } = await import("./auth");
    await expect(authApi.login("bad@example.com", "wrong")).rejects.toThrow("Invalid credentials");
  });

  test("register calls POST /api/auth/register", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

    const { authApi } = await import("./auth");
    const result = await authApi.register({
      email: "new@example.com",
      password: "password123",
      displayName: "New User",
    });

    expect(mockPost).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({
      email: "new@example.com",
      displayName: "New User",
    }));
    expect(result.user.email).toBe("test@example.com");
  });

  test("logout calls POST /api/auth/logout and clears cookies", async () => {
    mockPost.mockResolvedValueOnce({});

    const { authApi } = await import("./auth");
    await authApi.logout();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/logout");
    expect(mockClearAuthCookies).toHaveBeenCalled();
    expect(mockClearUser).toHaveBeenCalled();
  });

  test("logout clears user store even on error", async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { message: "Logout failed" } },
    });

    const { authApi } = await import("./auth");
    await expect(authApi.logout()).rejects.toThrow("Logout failed");
    expect(mockClearUser).toHaveBeenCalled();
  });

  test("generateAccessToken refreshes tokens and persists session", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

    const { authApi } = await import("./auth");
    const result = await authApi.generateAccessToken("old-refresh");

    expect(mockPost).toHaveBeenCalledWith("/api/auth/refresh", {
      refreshToken: "old-refresh",
    });
    expect(result.accessToken).toBe("access-123");
    expect(mockSetAuthCookies).toHaveBeenCalled();
  });

  test("switchOrganization calls POST /api/auth/switch-org", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

    const { authApi } = await import("./auth");
    const result = await authApi.switchOrganization("org-new");

    expect(mockPost).toHaveBeenCalledWith("/api/auth/switch-org", expect.objectContaining({
      organizationId: "org-new",
    }));
    expect(result.accessToken).toBe("access-123");
  });
});
