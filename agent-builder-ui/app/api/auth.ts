import api from "@/services/axios";
import { APIError } from "@/shared/interfaces";
import {
  clearAuthCookies,
  getRefreshToken,
  setAuthCookies,
} from "@/services/authCookies.client";
import { useUserStore } from "@/hooks/use-user";
import { assertBuilderAppAccess } from "@/lib/auth/app-access";
import { ensureBuilderSurfaceSession } from "@/lib/auth/tenant-switch";

interface AuthSessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
  platformRole?: "platform_admin" | "user";
  activeOrganization?: {
    id: string;
    name: string;
    slug: string;
    kind: "developer" | "customer";
    plan: string;
  } | null;
  activeMembership?: {
    id: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    organizationKind: "developer" | "customer";
    organizationPlan: string;
    role: string;
    status: string;
  } | null;
  memberships?: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    organizationKind: "developer" | "customer";
    organizationPlan: string;
    role: string;
    status: string;
  }>;
  appAccess?: {
    admin: boolean;
    builder: boolean;
    customer: boolean;
  };
}

/**
 * Response from token refresh API
 */
export type TokenResponse = AuthSessionResponse;

interface LocalRegisterInput {
  email: string;
  password: string;
  displayName: string;
  organizationName?: string;
  organizationSlug?: string;
  organizationKind?: "developer" | "customer";
  membershipRole?: "owner" | "admin" | "developer" | "employee";
}

const ACCESS_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function syncBuilderUser(session: AuthSessionResponse) {
  useUserStore.getState().setUser({
    id: session.user.id,
    fullName: session.user.displayName || session.user.email,
    email: session.user.email,
    company: session.activeOrganization?.name,
    accessToken: session.accessToken,
    activeOrganization: session.activeOrganization ?? null,
    activeMembership: session.activeMembership ?? null,
    memberships: session.memberships ?? [],
    platformRole: session.platformRole ?? "user",
    appAccess: session.appAccess ?? null,
  });
}

function persistSession(session: AuthSessionResponse): void {
  setAuthCookies(
    session.accessToken,
    session.refreshToken,
    ACCESS_TOKEN_MAX_AGE_SECONDS,
    REFRESH_TOKEN_MAX_AGE_SECONDS
  );
  syncBuilderUser(session);
}

export async function switchBuilderOrganizationRequest(
  organizationId: string,
  refreshToken?: string
): Promise<AuthSessionResponse> {
  const resolvedRefreshToken = refreshToken ?? getRefreshToken();
  const response = await api.post<AuthSessionResponse>("/api/auth/switch-org", {
    organizationId,
    ...(resolvedRefreshToken ? { refreshToken: resolvedRefreshToken } : {}),
  });
  return response.data;
}

async function ensureBuilderSession(
  session: AuthSessionResponse
): Promise<AuthSessionResponse> {
  return ensureBuilderSurfaceSession(session, async (organizationId) =>
    switchBuilderOrganizationRequest(organizationId, session.refreshToken)
  );
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthSessionResponse> => {
    try {
      const response = await api.post<AuthSessionResponse>("/api/auth/login", {
        email,
        password,
      });
      const session = await ensureBuilderSession(response.data);
      assertBuilderAppAccess(session);
      persistSession(session);
      return session;
    } catch (error: unknown) {
      const axiosError = error as APIError;
      throw new Error(
        axiosError.response?.data?.detail ||
          axiosError.response?.data?.message ||
          "Login failed"
      );
    }
  },

  register: async (input: LocalRegisterInput): Promise<AuthSessionResponse> => {
    try {
      const response = await api.post<AuthSessionResponse>("/api/auth/register", input);
      const session = await ensureBuilderSession(response.data);
      assertBuilderAppAccess(session);
      persistSession(session);
      return session;
    } catch (error: unknown) {
      const axiosError = error as APIError;
      throw new Error(
        axiosError.response?.data?.detail ||
          axiosError.response?.data?.message ||
          "Registration failed"
      );
    }
  },

  /**
   * Logout user
   * Calls backend logout endpoint and clears local session data
   */
  logout: async (): Promise<void> => {
    try {
      // Call backend logout endpoint
      await api.post("/api/auth/logout");

      // Clear auth cookies
      clearAuthCookies();
      // Clear user store
      useUserStore.getState().clearUser("auth api logout");
    } catch (error: unknown) {
      const axiosError = error as APIError;
      // Even if there's an error, try to clear the user store
      useUserStore.getState().clearUser("auth api logout catch");
      throw new Error(axiosError.response?.data?.message || "Logout failed");
    }
  },

  /**
   * Generate new access token using refresh token
   * @param refreshToken The refresh token to use for generating a new access token
   */
  generateAccessToken: async (
    refreshToken: string
  ): Promise<TokenResponse> => {
    try {
      const response = await api.post<TokenResponse>("/api/auth/refresh", {
        refreshToken,
      });
      const session = await ensureBuilderSession(response.data);
      assertBuilderAppAccess(session);
      persistSession(session);
      return session;
    } catch (error: unknown) {
      const axiosError = error as APIError;
      throw new Error(
        axiosError.response?.data?.detail ||
          axiosError.response?.data?.message ||
          "Failed to generate new access token"
      );
    }
  },

  switchOrganization: async (
    organizationId: string
  ): Promise<AuthSessionResponse> => {
    try {
      const session = await switchBuilderOrganizationRequest(organizationId);
      assertBuilderAppAccess(session);
      persistSession(session);
      return session;
    } catch (error: unknown) {
      const axiosError = error as APIError;
      throw new Error(
        axiosError.response?.data?.detail ||
          axiosError.response?.data?.message ||
          "Could not switch organization"
      );
    }
  },
};
