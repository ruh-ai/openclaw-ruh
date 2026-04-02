import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";

const mockPush = mock(() => {});
const mockReplace = mock(() => {});

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
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
        id: "user-1",
        email: "admin@ruh.ai",
        displayName: "Admin",
        platformRole: "platform_admin",
        appAccess: { admin: true, builder: true, customer: false },
      }),
  } as Response),
);

describe("AdminSessionGate", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  test("shows loading spinner initially", async () => {
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    const { container } = render(
      <AdminSessionGate>
        <div>Protected Content</div>
      </AdminSessionGate>,
    );
    // Should show spinner, not children
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(container.textContent).not.toContain("Protected Content");
  });

  test("renders children when session is valid admin", async () => {
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    const { findByText } = render(
      <AdminSessionGate>
        <div>Protected Content</div>
      </AdminSessionGate>,
    );
    const content = await findByText("Protected Content");
    expect(content).toBeTruthy();
  });

  test("redirects to login when fetch fails", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 401 } as Response),
    );
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    render(
      <AdminSessionGate>
        <div>Protected Content</div>
      </AdminSessionGate>,
    );
    // Wait for the async bootstrap to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).toHaveBeenCalled();
    const url = mockReplace.mock.calls[0]?.[0] as string;
    expect(url).toContain("/login");
    expect(url).toContain("redirect_url");
  });

  test("redirects when user lacks admin access", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "user-2",
            email: "dev@ruh.ai",
            displayName: "Dev",
            platformRole: "user",
            appAccess: { admin: false, builder: true, customer: false },
          }),
      } as Response),
    );
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    render(
      <AdminSessionGate>
        <div>Admin Only</div>
      </AdminSessionGate>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).toHaveBeenCalled();
  });

  test("calls /api/auth/me with credentials", async () => {
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    render(
      <AdminSessionGate>
        <div>Content</div>
      </AdminSessionGate>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0] as unknown[];
    const url = call[0] as string;
    expect(url).toContain("/api/auth/me");
  });

  test("redirects when appAccess is null", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "user-3",
            email: "none@ruh.ai",
            displayName: "No Access",
            appAccess: null,
          }),
      } as Response),
    );
    const { AdminSessionGate } = await import(
      "../app/_components/AdminSessionGate"
    );
    render(
      <AdminSessionGate>
        <div>Content</div>
      </AdminSessionGate>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).toHaveBeenCalled();
  });
});
