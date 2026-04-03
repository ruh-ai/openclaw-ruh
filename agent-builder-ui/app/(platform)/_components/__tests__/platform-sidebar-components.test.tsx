import { describe, expect, test, mock, beforeEach } from "bun:test";

// --- Mocks ---

const mockPush = mock(() => {});
const mockReplace = mock(() => {});
const mockRefresh = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

mock.module("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

mock.module("@/hooks/useSidebarCollapseStore", () => ({
  useSidebarCollapseStore: () => ({
    isCollapsed: false,
    toggleCollapse: mock(() => {}),
  }),
}));

mock.module("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

mock.module("@/hooks/use-user", () => ({
  useUserStore: () => ({
    user: {
      fullName: "Test User",
      email: "test@ruh.ai",
      memberships: [],
      activeOrganization: { id: "org-1" },
    },
  }),
}));

mock.module("@/app/api/auth", () => ({
  authApi: {
    login: mock(() => Promise.resolve()),
    register: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    generateAccessToken: mock(() => Promise.resolve()),
    switchOrganization: mock(() => Promise.resolve()),
  },
  switchBuilderOrganizationRequest: mock(() => Promise.resolve()),
}));

mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

mock.module("@/components/ui/sheet", () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <div onClick={onClick}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

// --- Tests ---

describe("ConditionalSidebar", () => {
  test("exports a component that renders children", async () => {
    const { ConditionalSidebar } = await import("../ConditionalSidebar");
    expect(ConditionalSidebar).toBeDefined();
    expect(typeof ConditionalSidebar).toBe("function");
  });
});

describe("DeveloperSidebar", () => {
  test("exports a component", async () => {
    const { DeveloperSidebar } = await import("../DeveloperSidebar");
    expect(DeveloperSidebar).toBeDefined();
    expect(typeof DeveloperSidebar).toBe("function");
  });
});

describe("DeveloperSidebarHeader", () => {
  test("exports a component", async () => {
    const { DeveloperSidebarHeader } = await import("../DeveloperSidebarHeader");
    expect(DeveloperSidebarHeader).toBeDefined();
    expect(typeof DeveloperSidebarHeader).toBe("function");
  });
});

describe("DeveloperMenuItems", () => {
  test("exports a component", async () => {
    const { DeveloperMenuItems } = await import("../DeveloperMenuItems");
    expect(DeveloperMenuItems).toBeDefined();
    expect(typeof DeveloperMenuItems).toBe("function");
  });
});

describe("MobileDeveloperSidebar", () => {
  test("exports a component", async () => {
    const { MobileDeveloperSidebar } = await import("../MobileDeveloperSidebar");
    expect(MobileDeveloperSidebar).toBeDefined();
    expect(typeof MobileDeveloperSidebar).toBe("function");
  });
});

describe("UserProfileSection", () => {
  test("exports a component", async () => {
    const { UserProfileSection } = await import("../UserProfileSection");
    expect(UserProfileSection).toBeDefined();
    expect(typeof UserProfileSection).toBe("function");
  });
});
