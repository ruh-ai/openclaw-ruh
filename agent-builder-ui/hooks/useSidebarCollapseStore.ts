import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarCollapseState {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarCollapseStore = create<SidebarCollapseState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      toggleCollapse: () =>
        set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed: boolean) => set({ isCollapsed: collapsed }),
    }),
    {
      name: "sidebar-collapse-storage",
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    }
  )
);
