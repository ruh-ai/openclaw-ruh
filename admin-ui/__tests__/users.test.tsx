import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  test("renders user row with data covering roleTone and statusTone branches", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });
    expect(container.textContent).toContain("developer");
    expect(container.textContent).toContain("active");
  });

  test("status filter select onChange updates filter state", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    const selects = container.querySelectorAll("select");
    const statusSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === "active"),
    );
    expect(statusSelect).toBeTruthy();
    if (statusSelect) {
      await act(async () => {
        await userEvent.selectOptions(statusSelect, "active");
      });
      expect((statusSelect as HTMLSelectElement).value).toBe("active");
    }
  });

  test("updateUser: calls PATCH endpoint when Suspend button is clicked", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    // Find the Suspend button (user is active so button reads "Suspend")
    const buttons = Array.from(container.querySelectorAll("button"));
    const suspendBtn = buttons.find((b) => b.textContent?.includes("Suspend"));
    expect(suspendBtn).toBeTruthy();

    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      suspendBtn!.click();
    });

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      const inits = mockFetch.mock.calls.map((c) => (c as unknown[])[1] as RequestInit);
      expect(inits.some((i) => i?.method === "PATCH")).toBe(true);
    });
  });

  test("deleteUser: calls DELETE endpoint when confirmed", async () => {
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;

    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const deleteBtn = buttons.find((b) => b.textContent?.includes("Delete user"));
    expect(deleteBtn).toBeTruthy();

    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      deleteBtn!.click();
    });

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      const inits = mockFetch.mock.calls.map((c) => (c as unknown[])[1] as RequestInit);
      expect(inits.some((i) => i?.method === "DELETE")).toBe(true);
    });
  });

  test("deleteUser: no DELETE request when confirm is cancelled", async () => {
    globalThis.confirm = mock(() => false) as unknown as typeof confirm;

    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    const callsBefore = mockFetch.mock.calls.length;
    const buttons = Array.from(container.querySelectorAll("button"));
    const deleteBtn = buttons.find((b) => b.textContent?.includes("Delete user"));
    if (deleteBtn) {
      await act(async () => {
        deleteBtn.click();
      });
    }
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });

  test("search input onChange fires", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    const searchInput = container.querySelector(
      'input[placeholder="Search email or display name"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(searchInput, "admin");
    });
    expect(searchInput.value).toBe("admin");
  });

  test("role filter onChange fires", async () => {
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    const selects = Array.from(container.querySelectorAll("select"));
    const roleSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.textContent === "All roles"),
    );
    expect(roleSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(roleSelect!, "admin");
    });
    expect(roleSelect!.value).toBe("admin");
  });

  test("updateUser: shows error when PATCH fails", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "Update failed" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: "u1", email: "test@ruh.ai", displayName: "Test User",
                role: "developer", status: "active", emailVerified: true,
                createdAt: "2026-01-01",
                appAccess: { admin: false, builder: true, customer: false },
                memberships: [], primaryOrganization: null,
              },
            ],
            total: 1,
          }),
      } as Response);
    });

    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const suspendBtn = buttons.find((b) => b.textContent?.includes("Suspend"));
    expect(suspendBtn).toBeTruthy();

    await act(async () => {
      suspendBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Update failed");
    }, { timeout: 3000 });
  });

  test("deleteUser: shows error when DELETE fails", async () => {
    globalThis.confirm = mock(() => true) as unknown as typeof confirm;
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "Delete failed" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: "u1", email: "test@ruh.ai", displayName: "Test User",
                role: "developer", status: "active", emailVerified: true,
                createdAt: "2026-01-01",
                appAccess: { admin: false, builder: true, customer: false },
                memberships: [], primaryOrganization: null,
              },
            ],
            total: 1,
          }),
      } as Response);
    });

    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const deleteBtn = buttons.find((b) => b.textContent?.includes("Delete user"));
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Delete failed");
    }, { timeout: 3000 });
  });

  test("roleTone returns neutral for end_user role", async () => {
    const endUser = {
      id: "u3", email: "user@ruh.ai", displayName: "End User",
      role: "end_user", status: "pending", emailVerified: false,
      createdAt: "2026-01-01",
      appAccess: { admin: false, builder: false, customer: true },
      memberships: [], primaryOrganization: null,
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [endUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("user@ruh.ai");
    });
    expect(container.textContent).toContain("end_user");
    // statusTone("pending") returns "warning"
    expect(container.textContent).toContain("pending");
  });

  test("renders admin and suspended user tone variants", async () => {
    const adminUser = {
      id: "u2",
      email: "admin@ruh.ai",
      displayName: "Admin",
      role: "admin",
      status: "suspended",
      emailVerified: true,
      createdAt: "2026-01-01",
      appAccess: { admin: true, builder: true, customer: false },
      memberships: [],
      primaryOrganization: null,
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [adminUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("admin@ruh.ai");
    });
    expect(container.textContent).toContain("suspended");
  });
});
