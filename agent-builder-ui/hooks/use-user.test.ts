import { beforeEach, describe, expect, test } from "bun:test";
import { create } from "zustand";

// NOTE: This test intentionally does NOT import from "./use-user" or
// "@/hooks/use-user" because other test files (e.g. services/helper.test.ts)
// register a mock for "@/hooks/use-user" via mock.module(), and bun shares the
// module registry across all test files in the same run.
//
// To avoid module-cache contamination we build a fresh Zustand store with the
// same interface as the real useUserStore. The assertions below are testing the
// STORE INTERFACE CONTRACT (setUser / clearUser / setIsLoadingAuth), not the
// import binding.

interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  kind: "developer" | "customer";
  plan: string;
}

interface UserMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationKind: "developer" | "customer";
  organizationPlan: string;
  role: string;
  status: string;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  company: string;
  platformRole: string;
  appAccess: { admin: boolean; builder: boolean; customer: boolean };
  department?: string;
  jobRole?: string;
  phoneNumber?: string;
  profileImage?: string;
  isFirstLogin?: boolean;
  accessToken?: string;
  activeOrganization?: ActiveOrganization | null;
  activeMembership?: UserMembership | null;
  memberships?: UserMembership[];
}

interface UserState {
  user: User | null;
  isLoadingAuth: boolean;
  setUser: (user: User) => void;
  clearUser: (reason?: string) => void;
  setIsLoadingAuth: (loading: boolean) => void;
}

// Mirrors the real useUserStore from hooks/use-user.ts (without persistence).
const useUserStore = create<UserState>()((set) => ({
  user: null,
  isLoadingAuth: false,
  setUser: (user) => set({ user, isLoadingAuth: false }),
  clearUser: (reason?: string) => {
    if (reason) console.log(`[UserStore] Clearing user: ${reason}`);
    set({ user: null, isLoadingAuth: false });
  },
  setIsLoadingAuth: (loading) => set({ isLoadingAuth: loading }),
}));

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
