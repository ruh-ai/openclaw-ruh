import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  kind: "developer" | "customer";
  plan: string;
}

export interface UserMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationKind: "developer" | "customer";
  organizationPlan: string;
  role: string;
  status: string;
}

export interface AppAccess {
  admin: boolean;
  builder: boolean;
  customer: boolean;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  company?: string;
  department?: string;
  jobRole?: string;
  phoneNumber?: string;
  profileImage?: string;
  isFirstLogin?: boolean;
  accessToken?: string;
  activeOrganization?: ActiveOrganization | null;
  activeMembership?: UserMembership | null;
  memberships?: UserMembership[];
  platformRole?: "platform_admin" | "user";
  appAccess?: AppAccess | null;
}

interface UserStore {
  user: User | null;
  isLoadingAuth: boolean;
  setUser: (user: User) => void;
  clearUser: (reason?: string) => void;
  setIsLoadingAuth: (loading: boolean) => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      isLoadingAuth: true,
      setUser: (user) => set({ user, isLoadingAuth: false }),
      clearUser: (reason?: string) => {
        if (reason) {
          console.log(`[UserStore] Clearing user: ${reason}`);
        }
        set({ user: null, isLoadingAuth: false });
      },
      setIsLoadingAuth: (loading) => set({ isLoadingAuth: loading }),
    }),
    {
      name: "user-session-storage",
    }
  )
);
