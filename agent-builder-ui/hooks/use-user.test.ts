import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useUserStore, type User } from "./use-user";

const testUser: User = {
  id: "user-001",
  fullName: "Test User",
  email: "test@ruh.ai",
  company: "Ruh Inc",
  platformRole: "user",
  appAccess: { admin: false, builder: true, customer: false },
};

beforeEach(() => {
  useUserStore.getState().clearUser();
});

describe("useUserStore", () => {
  test("initial state has null user", () => {
    const state = useUserStore.getState();
    expect(state.user).toBeNull();
  });

  test("setUser stores user and clears loading", () => {
    useUserStore.getState().setUser(testUser);
    const state = useUserStore.getState();
    expect(state.user?.id).toBe("user-001");
    expect(state.user?.email).toBe("test@ruh.ai");
    expect(state.isLoadingAuth).toBe(false);
  });

  test("clearUser resets user to null", () => {
    useUserStore.getState().setUser(testUser);
    useUserStore.getState().clearUser();
    expect(useUserStore.getState().user).toBeNull();
    expect(useUserStore.getState().isLoadingAuth).toBe(false);
  });

  test("clearUser with reason logs to console", () => {
    useUserStore.getState().setUser(testUser);
    useUserStore.getState().clearUser("session expired");
    expect(useUserStore.getState().user).toBeNull();
  });

  test("setIsLoadingAuth toggles loading state", () => {
    useUserStore.getState().setIsLoadingAuth(true);
    expect(useUserStore.getState().isLoadingAuth).toBe(true);

    useUserStore.getState().setIsLoadingAuth(false);
    expect(useUserStore.getState().isLoadingAuth).toBe(false);
  });

  test("stores full user profile with all optional fields", () => {
    const fullUser: User = {
      ...testUser,
      department: "Engineering",
      jobRole: "Backend Lead",
      phoneNumber: "+1234567890",
      profileImage: "https://img.test/avatar.png",
      isFirstLogin: false,
      activeOrganization: {
        id: "org-001",
        name: "Dev Org",
        slug: "dev-org",
        kind: "developer",
        plan: "pro",
      },
      activeMembership: {
        id: "mem-001",
        organizationId: "org-001",
        organizationName: "Dev Org",
        organizationSlug: "dev-org",
        organizationKind: "developer",
        organizationPlan: "pro",
        role: "owner",
        status: "active",
      },
      memberships: [],
    };
    useUserStore.getState().setUser(fullUser);
    const stored = useUserStore.getState().user!;
    expect(stored.department).toBe("Engineering");
    expect(stored.activeOrganization?.kind).toBe("developer");
    expect(stored.activeMembership?.role).toBe("owner");
  });
});
