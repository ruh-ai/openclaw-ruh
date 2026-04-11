import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ replace, refresh }),
}));

describe("CustomerSessionGate", () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn();
  });

  test("renders children when the session has customer access", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        appAccess: { admin: false, builder: false, customer: true },
      }),
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Customer Home</div>
      </CustomerSessionGate>
    );

    expect(await screen.findByText("Customer Home")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("redirects to login when the session lacks customer access", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        appAccess: { admin: true, builder: false, customer: false },
      }),
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Customer Home</div>
      </CustomerSessionGate>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fmarketplace"
      );
    });
  });

  test("auto-switches instead of redirecting when the session has a customer membership", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            appAccess: { admin: false, builder: true, customer: false },
            memberships: [
              {
                organizationId: "org-dev",
                organizationSlug: "acme-dev",
                organizationKind: "developer",
                role: "owner",
                status: "active",
              },
              {
                organizationId: "org-customer",
                organizationSlug: "globex",
                organizationKind: "customer",
                role: "admin",
                status: "active",
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          appAccess: { admin: false, builder: false, customer: true },
          activeOrganization: {
            id: "org-customer",
            slug: "globex",
            kind: "customer",
          },
        }),
      };
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Customer Home</div>
      </CustomerSessionGate>
    );

    expect(await screen.findByText("Customer Home")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/api/auth/switch-org",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ organizationId: "org-customer" }),
      })
    );
  });

  test("redirects when /api/auth/me returns non-ok status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Protected Content</div>
      </CustomerSessionGate>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login?redirect_url=%2Fmarketplace");
    });
  });

  test("shows loading spinner before session resolves", () => {
    // Never resolve so we stay in loading state
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));

    // Must import fresh since modules are cached
    jest.isolateModules(async () => {
      const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");
      const { container } = render(
        <CustomerSessionGate>
          <div>Content</div>
        </CustomerSessionGate>
      );
      // Loading spinner present
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  test("switching org via the combobox calls switch-org and refreshes", async () => {
    let switchCalled = false;
    // First call returns two memberships with active org = org-customer-1
    // Second call (after switch) returns the new org
    (global.fetch as jest.Mock).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            appAccess: { admin: false, builder: false, customer: true },
            activeOrganization: { id: "org-customer-1", name: "Acme Corp", slug: "acme-corp", kind: "customer", plan: "growth" },
            memberships: [
              { organizationId: "org-customer-1", organizationName: "Acme Corp", organizationSlug: "acme-corp", organizationKind: "customer", role: "owner", status: "active" },
              { organizationId: "org-customer-2", organizationName: "Beta Org", organizationSlug: "beta-org", organizationKind: "customer", role: "admin", status: "active" },
            ],
          }),
        };
      }

      if (url.endsWith("/api/auth/switch-org") && options?.method === "POST") {
        switchCalled = true;
        return {
          ok: true,
          json: async () => ({
            appAccess: { admin: false, builder: false, customer: true },
            activeOrganization: { id: "org-customer-2", name: "Beta Org", slug: "beta-org", kind: "customer", plan: "growth" },
            memberships: [
              { organizationId: "org-customer-1", organizationName: "Acme Corp", organizationSlug: "acme-corp", organizationKind: "customer", role: "owner", status: "active" },
              { organizationId: "org-customer-2", organizationName: "Beta Org", organizationSlug: "beta-org", organizationKind: "customer", role: "admin", status: "active" },
            ],
          }),
        };
      }

      return { ok: true, json: async () => ({}) };
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Org Content</div>
      </CustomerSessionGate>
    );

    // Wait for the org switcher to appear
    await waitFor(() => screen.getByRole("combobox"));

    const select = screen.getByRole("combobox");
    // Switch to the second org
    await userEvent.selectOptions(select, "org-customer-2");

    await waitFor(() => expect(switchCalled).toBe(true));
  });

  test("renders org switcher when session has multiple customer memberships", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        appAccess: { admin: false, builder: false, customer: true },
        activeOrganization: {
          id: "org-customer-1",
          name: "Acme Corp",
          slug: "acme-corp",
          kind: "customer",
          plan: "growth",
        },
        memberships: [
          {
            organizationId: "org-customer-1",
            organizationName: "Acme Corp",
            organizationSlug: "acme-corp",
            organizationKind: "customer",
            role: "owner",
            status: "active",
          },
          {
            organizationId: "org-customer-2",
            organizationName: "Beta Org",
            organizationSlug: "beta-org",
            organizationKind: "customer",
            role: "admin",
            status: "active",
          },
        ],
      }),
    });

    const { CustomerSessionGate } = await import("@/app/_components/CustomerSessionGate");

    render(
      <CustomerSessionGate>
        <div>Multi-Org Content</div>
      </CustomerSessionGate>
    );

    await waitFor(() => screen.getByText("Multi-Org Content"));

    // The org switcher is a select with "Active Organization" label
    await waitFor(() => {
      expect(screen.getByText("Active Organization")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });
});
