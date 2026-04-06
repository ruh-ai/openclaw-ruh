import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

mock.module("next/navigation", () => ({
  usePathname: () => "/users",
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
        items: [
          {
            id: "u1",
            email: "test@ruh.ai",
            displayName: "Test User",
            role: "developer",
            status: "active",
            emailVerified: true,
            createdAt: "2026-01-01",
            appAccess: { admin: false, builder: true, customer: false },
            memberships: [],
            primaryOrganization: null,
          },
        ],
        total: 1,
      }),
  } as Response),
);

describe("UsersPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
  });

  test("renders People & Access heading", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { getByText } = render(<UsersPage />);
    expect(getByText("People & Access")).toBeTruthy();
  });

  test("renders search input", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { getByPlaceholderText } = render(<UsersPage />);
    expect(getByPlaceholderText("Search email or display name")).toBeTruthy();
  });

  test("renders role filter dropdown with All roles option", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    const selects = container.querySelectorAll("select");
    // There is a role filter select among the filter selects
    const roleSelect = Array.from(selects).find((s) =>
      Array.from(s.querySelectorAll("option")).some(
        (o) => o.textContent === "All roles",
      ),
    );
    expect(roleSelect).toBeTruthy();
  });

  test("renders table headers", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    const headers = container.querySelectorAll("th");
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain("User");
    expect(headerTexts).toContain("Access");
    expect(headerTexts).toContain("Status");
    expect(headerTexts).toContain("Created");
    expect(headerTexts).toContain("Actions");
  });

  test("fetches users from API on mount", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    render(<UsersPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/users");
  });
});
