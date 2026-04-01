import { describe, expect, test, mock } from "bun:test";
import { render } from "@testing-library/react";

mock.module("lucide-react", () => {
  const Icon = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children}</span>;
  return {
    Users: Icon, Bot: Icon, Server: Icon, Store: Icon,
    LayoutDashboard: Icon, Activity: Icon, LogOut: Icon,
    Shield: Icon, User: Icon, Code: Icon,
  };
});

mock.module("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("AdminLayout", () => {
  test("renders sidebar with Ruh Admin branding", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>Test content</div>
      </AdminLayout>,
    );
    expect(getByText("Ruh Admin")).toBeTruthy();
    expect(getByText("Platform Management")).toBeTruthy();
  });

  test("renders all navigation links", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>Test content</div>
      </AdminLayout>,
    );
    expect(getByText("Dashboard")).toBeTruthy();
    expect(getByText("Users")).toBeTruthy();
    expect(getByText("Agents")).toBeTruthy();
    expect(getByText("Marketplace")).toBeTruthy();
    expect(getByText("System")).toBeTruthy();
  });

  test("renders Sign Out button", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>Test content</div>
      </AdminLayout>,
    );
    expect(getByText("Sign Out")).toBeTruthy();
  });

  test("renders children in main content area", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>My page content</div>
      </AdminLayout>,
    );
    expect(getByText("My page content")).toBeTruthy();
  });

  test("navigation links have correct hrefs", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { container } = render(
      <AdminLayout>
        <div>content</div>
      </AdminLayout>,
    );
    const navLinks = container.querySelectorAll("nav a");
    const hrefs = Array.from(navLinks).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/users");
    expect(hrefs).toContain("/agents");
    expect(hrefs).toContain("/marketplace");
    expect(hrefs).toContain("/system");
  });
});
