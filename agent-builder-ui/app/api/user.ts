import api from "@/services/axios";
import { User, type ActiveOrganization, type UserMembership, type AppAccess } from "@/hooks/use-user";
import { assertBuilderAppAccess } from "@/lib/auth/app-access";
import { switchBuilderOrganizationRequest } from "@/app/api/auth";
import { ensureBuilderSurfaceSession } from "@/lib/auth/tenant-switch";

interface BackendCurrentUserResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  platformRole?: "platform_admin" | "user";
  activeOrganization?: ActiveOrganization | null;
  activeMembership?: UserMembership | null;
  memberships?: UserMembership[];
  appAccess?: AppAccess | null;
}

export function mapCurrentUser(data: BackendCurrentUserResponse): User {
  assertBuilderAppAccess(data);

  return {
    id: data.id,
    fullName: data.displayName || data.email,
    email: data.email,
    company: data.activeOrganization?.name,
    profileImage: data.avatarUrl ?? undefined,
    activeOrganization: data.activeOrganization ?? null,
    activeMembership: data.activeMembership ?? null,
    memberships: data.memberships ?? [],
    platformRole: data.platformRole ?? "user",
    appAccess: data.appAccess ?? null,
  };
}

export const userApi = {
  /**
   * Get current authenticated user details
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<BackendCurrentUserResponse>("/api/auth/me");
    const session = await ensureBuilderSurfaceSession(response.data, async (organizationId) => {
      await switchBuilderOrganizationRequest(organizationId);
      const refreshed = await api.get<BackendCurrentUserResponse>("/api/auth/me");
      return refreshed.data;
    });
    return mapCurrentUser(session);
  },
};
