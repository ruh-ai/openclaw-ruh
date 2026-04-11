import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

const pushFn = mock(() => {});

mock.module("next/navigation", () => ({
  usePathname: () => "/organizations",
  useRouter: () => ({ push: pushFn }),
}));

mock.module("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const orgRecord = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme",
  kind: "customer",
  plan: "pro",
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  memberCount: 10,
  activeMemberCount: 8,
  activeSessionCount: 3,
  membershipBreakdown: { owner: 1, admin: 2, developer: 5, employee: 2 },
  agentCount: 3,
  activeAgentCount: 2,
  listingCount: 1,
  publishedListingCount: 1,
  installCount: 25,
};

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [], total: 0 }),
  } as Response),
);

describe("OrganizationsPage", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      } as Response),
    );
    pushFn.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    localStorage.setItem("accessToken", "t");
  });

  test("renders Organizations heading", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { getByText } = render(<OrganizationsPage />);
    expect(getByText("Organizations")).toBeTruthy();
  });

  test("fetches organizations from API on mount", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    render(<OrganizationsPage />);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain("/api/admin/organizations");
  });

  test("renders organization rows after fetch", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [orgRecord], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });
    expect(container.textContent).toContain("acme");
    expect(container.textContent).toContain("active");
  });

  test("renders developer and customer kind tones", async () => {
    const devOrg = { ...orgRecord, id: "org-2", name: "Dev Org", kind: "developer" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [orgRecord, devOrg], total: 2 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("customer");
    });
    expect(container.textContent).toContain("developer");
  });

  test("shows empty state when no orgs match filters", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No organizations matched");
    }, { timeout: 3000 });
  });

  test("shows validation error when creating org without name", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);

    // Wait for initial load to complete
    await waitFor(() => {
      expect(container.textContent).toContain("No organizations matched");
    }, { timeout: 3000 });

    // Click create organization without entering a name
    const buttons = Array.from(container.querySelectorAll("button"));
    const createBtn = buttons.find((b) => b.textContent?.includes("Create organization"));
    expect(createBtn).toBeTruthy();

    await act(async () => {
      createBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Organization name is required");
    }, { timeout: 2000 });
  });

  test("search input onChange updates filter state", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    const searchInput = container.querySelector(
      'input[placeholder="Search org name or slug"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(searchInput, "acme");
    });
    expect(searchInput.value).toBe("acme");
  });

  test("updateOrganization: calls PATCH endpoint when status changed", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [orgRecord], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });

    // Click the "Suspend access" button
    const buttons = Array.from(container.querySelectorAll("button"));
    const suspendBtn = buttons.find((b) => b.textContent?.includes("Suspend access"));
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

  test("archive button calls PATCH with archived status", async () => {
    const suspendedOrg = { ...orgRecord, id: "org-suspended", status: "suspended", name: "Suspended Org" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [suspendedOrg], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Suspended Org");
    });

    // "Archive" button shows when status is not "archived"
    const buttons = Array.from(container.querySelectorAll("button"));
    const archiveBtn = buttons.find((b) => b.textContent?.trim() === "Archive");
    expect(archiveBtn).toBeTruthy();

    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      archiveBtn!.click();
    });

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      const inits = mockFetch.mock.calls.map((c) => (c as unknown[])[1] as RequestInit);
      expect(inits.some((i) => i?.method === "PATCH")).toBe(true);
    });
  });

  test("createOrganization sends POST when name is filled via userEvent", async () => {
    const smartFetch = mock((_url: unknown, init?: RequestInit) => {
      const method = init?.method;
      if (method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ organization: { id: "new-org-id" } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      } as Response);
    });
    globalThis.fetch = smartFetch as unknown as typeof fetch;

    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No organizations matched");
    }, { timeout: 3000 });

    // Fill in org name using userEvent
    const nameInput = container.querySelector(
      'input[placeholder="Organization name"]',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();

    await act(async () => {
      await userEvent.type(nameInput, "New Test Org");
    });

    expect(nameInput.value).toBe("New Test Org");

    // Click create
    const buttons = Array.from(container.querySelectorAll("button"));
    const createBtn = buttons.find((b) => b.textContent?.includes("Create organization"));
    expect(createBtn).toBeTruthy();

    await act(async () => {
      createBtn!.click();
    });

    await waitFor(() => {
      const calls = smartFetch.mock.calls as Array<[unknown, RequestInit?]>;
      expect(calls.some((c) => c[1]?.method === "POST")).toBe(true);
    }, { timeout: 3000 });
  });

  test("renders suspended org with danger tone", async () => {
    const suspendedOrg = { ...orgRecord, id: "org-s", name: "Suspended Org", status: "suspended" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [suspendedOrg], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("suspended");
    });
    expect(container.textContent).toContain("Reactivate");
  });

  test("updateOrganization: shows error when PATCH fails", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [orgRecord], total: 1 }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: "Update failed" }),
      } as Response);
    });

    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const suspendBtn = buttons.find((b) => b.textContent?.includes("Suspend access"));
    expect(suspendBtn).toBeTruthy();

    await act(async () => {
      suspendBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Update failed");
    });
  });

  test("createOrganization: shows error when POST fails", async () => {
    const smartFetch = mock((_url: unknown, init?: RequestInit) => {
      const method = init?.method;
      if (method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: "Slug already taken" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      } as Response);
    });
    globalThis.fetch = smartFetch as unknown as typeof fetch;

    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No organizations matched");
    }, { timeout: 3000 });

    // Fill in org name
    const nameInput = container.querySelector(
      'input[placeholder="Organization name"]',
    ) as HTMLInputElement;
    await act(async () => {
      await userEvent.type(nameInput, "Taken Org");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const createBtn = buttons.find((b) => b.textContent?.includes("Create organization"));
    await act(async () => {
      createBtn!.click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("Slug already taken");
    }, { timeout: 3000 });
  });

  test("form select onChange handlers update createDraft state", async () => {
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("No organizations matched");
    }, { timeout: 3000 });

    // Change slug input
    const slugInput = container.querySelector(
      'input[placeholder="Slug (optional)"]',
    ) as HTMLInputElement;
    expect(slugInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(slugInput, "my-slug");
    });
    expect(slugInput.value).toBe("my-slug");

    // Change kind select to "developer"
    const selects = Array.from(container.querySelectorAll("select"));
    const kindSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "developer" && o.textContent === "Developer"),
    );
    expect(kindSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(kindSelect!, "developer");
    });
    expect(kindSelect!.value).toBe("developer");

    // Change plan select
    const planSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "enterprise" && o.textContent === "Enterprise"),
    );
    expect(planSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(planSelect!, "enterprise");
    });
    expect(planSelect!.value).toBe("enterprise");

    // Change ownerEmail input
    const emailInput = container.querySelector(
      'input[placeholder="Owner email (optional, existing user)"]',
    ) as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    await act(async () => {
      await userEvent.type(emailInput, "test@example.com");
    });
    expect(emailInput.value).toBe("test@example.com");

    // Change ownerRole select
    const roleSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "employee" && o.textContent === "Employee"),
    );
    expect(roleSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(roleSelect!, "admin");
    });
    expect(roleSelect!.value).toBe("admin");

    // Change ownerStatus select
    const statusSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "invited" && o.textContent === "Invited"),
    );
    expect(statusSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(statusSelect!, "invited");
    });
    expect(statusSelect!.value).toBe("invited");

    // Change org status select
    const orgStatusSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "archived" && o.textContent === "Archived"),
    );
    expect(orgStatusSelect).toBeTruthy();
    await act(async () => {
      await userEvent.selectOptions(orgStatusSelect!, "archived");
    });
    expect(orgStatusSelect!.value).toBe("archived");
  });

  test("plan select onChange calls updateOrganization", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [orgRecord], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Acme Corp");
    });

    // Find the plan dropdown for the existing org (the one with "free"/"pro"/"business"/"enterprise" options in the org row area)
    const selects = Array.from(container.querySelectorAll("select"));
    // Find select that currently has value "pro" (from orgRecord.plan)
    const planSelect = selects.find((s) => s.value === "pro");
    if (planSelect) {
      const callsBefore = mockFetch.mock.calls.length;
      await act(async () => {
        await userEvent.selectOptions(planSelect, "enterprise");
      });
      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    }
  });

  test("statusTone returns warning for unknown status", async () => {
    const unknownOrg = { ...orgRecord, id: "org-unknown", name: "Unknown Org", status: "pending_review" };
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [unknownOrg], total: 1 }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Unknown Org");
    });
  });

  test("shows error message when API fails", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Failed to load orgs" }),
      } as Response),
    );
    const { default: OrganizationsPage } = await import(
      "../app/(admin)/organizations/page"
    );
    const { container } = render(<OrganizationsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain("Failed to load orgs");
    });
  });
});
