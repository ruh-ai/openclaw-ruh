import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, act } from "@testing-library/react";
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

  test("Sign Out button calls logout endpoint and redirects", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    // Mock window.location.href setter
    const originalLocation = window.location;
    const locationMock = { ...originalLocation, href: "" };
    Object.defineProperty(window, "location", {
      value: locationMock,
      writable: true,
    });

    const { default: AdminLayout } = await import("../app/(admin)/layout");
    const { container } = render(
      <AdminLayout>
        <div>Test</div>
      </AdminLayout>,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const signOutBtn = buttons.find((b) => b.textContent?.includes("Sign Out"));
    expect(signOutBtn).toBeTruthy();

    await act(async () => {
      signOutBtn!.click();
      // Let the async handler complete
      await new Promise((r) => setTimeout(r, 50));
    });

    // Verify logout was called
    const urls = mockFetch.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(urls.some((u) => u.includes("/api/auth/logout"))).toBe(true);

    // Verify redirect
    expect(locationMock.href).toBe("/login");

    // Restore
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
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
