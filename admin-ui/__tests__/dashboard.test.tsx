import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";

// Mock lucide-react icons to avoid SVG rendering issues
mock.module("lucide-react", () => {
  const Icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children}</span>;
  return {
    Users: Icon,
    Bot: Icon,
    Server: Icon,
    Store: Icon,
    LayoutDashboard: Icon,
    Activity: Icon,
    LogOut: Icon,
    Shield: Icon,
    User: Icon,
    Code: Icon,
  };
});

mock.module("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        totalUsers: 10,
        totalAgents: 5,
        activeSandboxes: 3,
        marketplaceListings: 2,
      }),
  } as Response),
);

describe("DashboardPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
  });

  test("renders Dashboard heading", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { getByText } = render(<DashboardPage />);
    expect(getByText("Dashboard")).toBeTruthy();
  });

  test("renders platform overview subtitle", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { getByText } = render(<DashboardPage />);
    expect(getByText("Platform overview and health")).toBeTruthy();
  });

  test("renders 4 stat card labels", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    const { container } = render(<DashboardPage />);
    const text = container.textContent || "";
    expect(text).toContain("Total Users");
    expect(text).toContain("Total Agents");
    expect(text).toContain("Active Sandboxes");
    expect(text).toContain("Marketplace");
  });

  test("fetches stats from API on mount", async () => {
    const { default: DashboardPage } = await import(
      "../app/(admin)/dashboard/page"
    );
    render(<DashboardPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/stats");
  });
});
