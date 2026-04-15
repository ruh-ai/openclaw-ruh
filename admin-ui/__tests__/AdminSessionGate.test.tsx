import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor, act } from "@testing-library/react";

const replaceFn = mock(() => {});

mock.module("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: replaceFn }),
  redirect: () => {},
}));

// Must be after mock.module so the component picks up mocked modules
const { AdminSessionGate } = await import(
  "../app/_components/AdminSessionGate"
);

beforeEach(() => {
  replaceFn.mockClear();
  // @ts-expect-error — replacing global fetch for test
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    })
  );
});

describe("AdminSessionGate", () => {
  test("shows loading spinner initially (does not render children)", () => {
    // Use a never-resolving promise so the component stays in loading state
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() => new Promise(() => {}));

    const { queryByText, container } = render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>
    );

    // Component should not render children while loading
    expect(queryByText("Protected")).toBeNull();
    // Should render spinner wrapper (two nested divs)
    expect(container.querySelector("div > div")).toBeTruthy();
  });

  test("renders children when authenticated with admin access", async () => {
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "u1",
            email: "admin@ruh.ai",
            displayName: "Admin",
            platformRole: "platform_admin",
            appAccess: { admin: true, builder: true, customer: true },
          }),
      })
    );

    const { getByText } = render(
      <AdminSessionGate>
        <div>Protected Content</div>
      </AdminSessionGate>
    );

    await waitFor(() => {
      expect(getByText("Protected Content")).toBeTruthy();
    });
    expect(replaceFn).not.toHaveBeenCalled();
  });

  test("redirects when fetch returns non-ok response", async () => {
    // Default beforeEach sets fetch to return 401
    render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard"
      );
    });
  });

  test("redirects when user lacks admin app access", async () => {
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "u2",
            email: "user@ruh.ai",
            displayName: "User",
            appAccess: { admin: false, builder: true, customer: true },
          }),
      })
    );

    render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard"
      );
    });
  });

  test("redirects when fetch throws a network error", async () => {
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

    render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard"
      );
    });
  });
});
