import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, waitFor } from "@testing-library/react";

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
  // Default: 401 unauthenticated
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
  test("renders loading spinner (no children) initially", async () => {
    // Use a never-resolving fetch so loading state persists
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() => new Promise(() => {}));

    const { container, queryByText } = render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>,
    );

    // Children should not be rendered during loading
    expect(queryByText("Protected")).toBeNull();
    // Spinner wrapper divs should exist
    const outerDiv = container.querySelector("div");
    expect(outerDiv).toBeTruthy();
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
            appAccess: { admin: true, builder: true, customer: true },
          }),
      })
    );

    const { getByText } = render(
      <AdminSessionGate>
        <div>Protected Content</div>
      </AdminSessionGate>,
    );

    await waitFor(() => {
      expect(getByText("Protected Content")).toBeTruthy();
    }, { timeout: 3000 });
    expect(replaceFn).not.toHaveBeenCalled();
  });

  test("redirects to login when fetch returns 401", async () => {
    // Default beforeEach sets fetch to 401
    render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>,
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard",
      );
    }, { timeout: 3000 });
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
      </AdminSessionGate>,
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard",
      );
    }, { timeout: 3000 });
  });

  test("redirects when fetch throws a network error", async () => {
    // @ts-expect-error — replacing global fetch for test
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

    render(
      <AdminSessionGate>
        <div>Protected</div>
      </AdminSessionGate>,
    );

    await waitFor(() => {
      expect(replaceFn).toHaveBeenCalledWith(
        "/login?redirect_url=%2Fdashboard",
      );
    }, { timeout: 3000 });
  });
});
