import { render, screen, waitFor } from "@testing-library/react";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ replace }),
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
});
