import { fireEvent, render, waitFor } from "@testing-library/react";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("CustomerLogin", () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appAccess: { admin: false, builder: false, customer: true },
      }),
    });
  });

  test("renders email and password fields", async () => {
    const { default: CustomerLogin } = await import("@/app/login/page");
    const { getByPlaceholderText, container } = render(<CustomerLogin />);

    expect(getByPlaceholderText("admin@globex.test")).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeTruthy();
  });

  test("shows an access error when the session is not a customer user", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        appAccess: { admin: false, builder: true, customer: false },
      }),
    });

    const { default: CustomerLogin } = await import("@/app/login/page");
    const { getByPlaceholderText, getByText, container } = render(<CustomerLogin />);

    fireEvent.change(getByPlaceholderText("admin@globex.test"), {
      target: { value: "dev-owner@acme-dev.test" },
    });

    fireEvent.change(
      container.querySelector('input[type="password"]') as HTMLInputElement,
      {
        target: { value: "RuhTest123" },
      }
    );

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(getByText("Customer organization access required")).toBeInTheDocument();
    });
  });

  test("switches to a customer organization when the login session starts on the wrong org", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/login")) {
        return {
          ok: true,
          json: async () => ({
            accessToken: "access-token",
            refreshToken: "refresh-token",
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

    const { default: CustomerLogin } = await import("@/app/login/page");
    const { getByPlaceholderText, container } = render(<CustomerLogin />);

    fireEvent.change(getByPlaceholderText("admin@globex.test"), {
      target: { value: "prasanjit@ruh.ai" },
    });
    fireEvent.change(
      container.querySelector('input[type="password"]') as HTMLInputElement,
      {
        target: { value: "RuhTest123" },
      }
    );

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/");
    });

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
