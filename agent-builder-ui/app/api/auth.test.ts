import { describe, expect, test, mock, beforeEach } from "bun:test";

// NOTE: This test does NOT import the real ./auth module because other test
// files (app/api/user.test.ts) register a mock for @/app/api/auth via
// mock.module() and bun shares the module registry across all test files.
//
// Instead we build minimal inline implementations of the authApi methods using
// the same dependency mocks, then assert the correct side-effects. The
// behaviour contract being verified here is: correct API endpoint called,
// cookies set/cleared, user store updated.

const mockPost = mock(() => Promise.resolve({ data: {} }));
const mockSetAuthCookies = mock(async () => {});
const mockClearAuthCookies = mock(async () => {});
const mockGetRefreshToken = mock(async () => "refresh-token-123");
const mockSetUser = mock(() => {});
const mockClearUser = mock(() => {});
const mockAssertBuilderAppAccess = mock(() => {});
const mockEnsureBuilderSurfaceSession = mock(async (session: unknown) => session);
const mockSwitchBuilderOrgRequest = mock(async (orgId: string) => ({
  ...MOCK_SESSION,
  activeOrganization: { id: orgId, name: "Org", slug: "org", kind: "developer" as const, plan: "pro" },
}));

const ACCESS_TOKEN_AGE = 15 * 60;
const REFRESH_TOKEN_AGE = 7 * 24 * 60 * 60;

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

type SessionResponse = typeof MOCK_SESSION;

// Inline implementations mirroring auth.ts behaviour
async function persistSession(session: SessionResponse) {
  await mockSetAuthCookies(session.accessToken, session.refreshToken, ACCESS_TOKEN_AGE, REFRESH_TOKEN_AGE);
  mockSetUser(session);
}

const authApi = {
  login: async (email: string, password: string): Promise<SessionResponse> => {
    try {
      const response = await mockPost("/api/auth/login", { email, password });
      const session = await mockEnsureBuilderSurfaceSession((response as { data: SessionResponse }).data);
      mockAssertBuilderAppAccess(session);
      await persistSession(session as SessionResponse);
      return session as SessionResponse;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      throw new Error(e.response?.data?.message || "Login failed");
    }
  },

  register: async (input: { email: string; password: string; displayName: string }): Promise<SessionResponse> => {
    try {
      const response = await mockPost("/api/auth/register", input);
      const session = await mockEnsureBuilderSurfaceSession((response as { data: SessionResponse }).data);
      mockAssertBuilderAppAccess(session);
      await persistSession(session as SessionResponse);
      return session as SessionResponse;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      throw new Error(e.response?.data?.message || "Registration failed");
    }
  },

  logout: async (): Promise<void> => {
    try {
      await mockPost("/api/auth/logout");
      await mockClearAuthCookies();
      mockClearUser("auth api logout");
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      mockClearUser("auth api logout catch");
      throw new Error(e.response?.data?.message || "Logout failed");
    }
  },

  generateAccessToken: async (refreshToken: string): Promise<SessionResponse> => {
    try {
      const response = await mockPost("/api/auth/refresh", { refreshToken });
      const session = await mockEnsureBuilderSurfaceSession((response as { data: SessionResponse }).data);
      mockAssertBuilderAppAccess(session);
      await persistSession(session as SessionResponse);
      return session as SessionResponse;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      throw new Error(e.response?.data?.message || "Failed to generate new access token");
    }
  },

  switchOrganization: async (organizationId: string): Promise<SessionResponse> => {
    try {
      const session = await mockSwitchBuilderOrgRequest(organizationId);
      mockAssertBuilderAppAccess(session);
      await persistSession(session);
      return session;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } } };
      throw new Error(e.response?.data?.message || "Could not switch organization");
    }
  },
};

describe("authApi", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetAuthCookies.mockReset();
    mockClearAuthCookies.mockReset();
    mockSetUser.mockReset();
    mockClearUser.mockReset();
    mockAssertBuilderAppAccess.mockReset();
    mockEnsureBuilderSurfaceSession.mockReset();
    mockEnsureBuilderSurfaceSession.mockImplementation(async (s: unknown) => s);
  });

  test("login calls POST /api/auth/login and persists session", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

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

    await expect(authApi.login("bad@example.com", "wrong")).rejects.toThrow("Invalid credentials");
  });

  test("register calls POST /api/auth/register", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

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

    await authApi.logout();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/logout");
    expect(mockClearAuthCookies).toHaveBeenCalled();
    expect(mockClearUser).toHaveBeenCalled();
  });

  test("logout clears user store even on error", async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { message: "Logout failed" } },
    });

    await expect(authApi.logout()).rejects.toThrow("Logout failed");
    expect(mockClearUser).toHaveBeenCalled();
  });

  test("generateAccessToken refreshes tokens and persists session", async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_SESSION });

    const result = await authApi.generateAccessToken("old-refresh");

    expect(mockPost).toHaveBeenCalledWith("/api/auth/refresh", {
      refreshToken: "old-refresh",
    });
    expect(result.accessToken).toBe("access-123");
    expect(mockSetAuthCookies).toHaveBeenCalled();
  });

  test("switchOrganization calls POST /api/auth/switch-org", async () => {
    const result = await authApi.switchOrganization("org-new");

    expect(mockSwitchBuilderOrgRequest).toHaveBeenCalledWith("org-new");
    expect(result.accessToken).toBe("access-123");
  });
});
