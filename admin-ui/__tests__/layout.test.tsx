import { describe, expect, test, mock } from "bun:test";
import { render } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

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

mock.module("@/app/_components/AdminSessionGate", () => ({
  AdminSessionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("AdminLayout", () => {
  test("renders sidebar with Ruh Admin branding", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>Test content</div>
      </AdminLayout>,
    );
    expect(getByText("Super Admin")).toBeTruthy();
    expect(getByText("Ruh.ai")).toBeTruthy();
  });

  test("renders all navigation links", async () => {
    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { getByText } = render(
      <AdminLayout>
        <div>Test content</div>
      </AdminLayout>,
    );
    expect(getByText("Overview")).toBeTruthy();
    expect(getByText("People")).toBeTruthy();
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
