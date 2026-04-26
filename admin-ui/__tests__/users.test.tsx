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

const baseUser = {
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
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        items: [baseUser],
        total: 1,
      }),
  } as Response),
);

describe("UsersPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "test-token");
    // Reset window.confirm/prompt
    window.confirm = mock(() => true);
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

  test("renders admin and suspended user tone variants", async () => {
    const adminUser = {
      ...baseUser,
      id: "u2",
      email: "admin@ruh.ai",
      displayName: "Admin",
      role: "admin",
      status: "suspended",
      appAccess: { admin: true, builder: true, customer: false },
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

  test("renders user with all app access flags and primary organization", async () => {
    const fullUser = {
      ...baseUser,
      id: "u3",
      appAccess: { admin: true, builder: true, customer: true },
      primaryOrganization: { organizationName: "Ruh AI", organizationKind: "developer" },
      memberships: [
        {
          id: "m1",
          organizationName: "Ruh AI",
          organizationKind: "developer",
          role: "admin",
          status: "active",
        },
        {
          id: "m2",
          organizationName: "Acme Corp",
          organizationKind: "customer",
          role: "member",
          status: "active",
        },
      ],
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [fullUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Ruh AI");
    });
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("Primary org:");
  });

  test("renders no active surface when user has no access", async () => {
    const noAccessUser = {
      ...baseUser,
      id: "u4",
      appAccess: { admin: false, builder: false, customer: false },
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [noAccessUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("no active surface");
    });
  });

  test("renders user with pending status tone (warning fallback)", async () => {
    const pendingUser = {
      ...baseUser,
      id: "u5",
      status: "pending",
      emailVerified: false,
      role: "end_user",
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [pendingUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("pending");
    });
    expect(container.textContent).toContain("email pending");
  });

  test("handles fetch error gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Server error")),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Server error");
    });
  });

  test("handles non-Error fetch rejection", async () => {
    mockFetch.mockImplementation(() => Promise.reject("string error"));
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to load users");
    });
  });

  test("calls updateUser when role select is changed", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [baseUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    // Find the role change select (the one inside the Actions column)
    const actionSelects = container.querySelectorAll("td select");
    expect(actionSelects.length).toBeGreaterThan(0);
    const roleSelect = actionSelects[0] as HTMLSelectElement;

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.selectOptions(roleSelect, "admin");
    });

    // Should have called PATCH endpoint
    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find((call) => {
        const [, init] = call as [string, RequestInit | undefined];
        return init?.method === "PATCH";
      });
      expect(patchCall).toBeTruthy();
    });
  });

  test("calls suspend/activate when toggle button is clicked", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [baseUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { getByText } = render(<UsersPage />);
    await waitFor(() => {
      expect(getByText("Suspend")).toBeTruthy();
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getByText("Suspend"));
    });

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find((call) => {
        const [, init] = call as [string, RequestInit | undefined];
        return init?.method === "PATCH";
      });
      expect(patchCall).toBeTruthy();
    });
  });

  test("calls deleteUser when delete button is clicked and confirmed", async () => {
    window.confirm = mock(() => true);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [baseUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { getByText } = render(<UsersPage />);
    await waitFor(() => {
      expect(getByText("Delete user")).toBeTruthy();
    });

    mockFetch.mockClear();
    await act(async () => {
      await userEvent.click(getByText("Delete user"));
    });

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      const deleteCall = mockFetch.mock.calls.find((call) => {
        const [, init] = call as [string, RequestInit | undefined];
        return init?.method === "DELETE";
      });
      expect(deleteCall).toBeTruthy();
    });
  });

  test("does not call API when delete is cancelled", async () => {
    window.confirm = mock(() => false);
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [baseUser], total: 1 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { getByText } = render(<UsersPage />);
    await waitFor(() => {
      expect(getByText("Delete user")).toBeTruthy();
    });

    const callCountBefore = mockFetch.mock.calls.length;
    await act(async () => {
      await userEvent.click(getByText("Delete user"));
    });

    // No additional fetch calls (DELETE not sent)
    const deleteCall = mockFetch.mock.calls.slice(callCountBefore).find((call) => {
      const [, init] = call as [string, RequestInit | undefined];
      return init?.method === "DELETE";
    });
    expect(deleteCall).toBeUndefined();
  });

  test("shows error when updateUser fails", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [baseUser], total: 1 }),
        } as Response);
      }
      // PATCH call fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Update failed" }),
      } as unknown as Response);
    });
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container, getByText } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    await act(async () => {
      await userEvent.click(getByText("Suspend"));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Update failed");
    });
  });

  test("shows error when deleteUser fails", async () => {
    window.confirm = mock(() => true);
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [baseUser], total: 1 }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Delete failed" }),
      } as unknown as Response);
    });
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container, getByText } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("test@ruh.ai");
    });

    await act(async () => {
      await userEvent.click(getByText("Delete user"));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Delete failed");
    });
  });

  test("shows no users message when list is empty", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      } as Response),
    );
    const { default: UsersPage } = await import("../app/(admin)/users/page");
    const { container } = render(<UsersPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No users matched");
    });
  });
});
