import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, fireEvent, waitFor } from "@testing-library/react";
import lucideMock from "../test-lucide-mock";
mock.module("lucide-react", () => lucideMock);

// Mock next/navigation before importing the component
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}), back: mock(() => {}) }),
  usePathname: () => "/login",
}));

// Mock fetch
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({ user: { role: "admin" }, accessToken: "tok" }),
  } as Response),
);

describe("AdminLogin", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  test("renders email input with placeholder", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByPlaceholderText } = render(<AdminLogin />);
    expect(getByPlaceholderText("admin@ruh.ai")).toBeTruthy();
  });

  test("renders password input", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { container } = render(<AdminLogin />);
    const passwordInput = container.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();
  });

  test("renders Enter control plane button", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Enter control plane")).toBeTruthy();
  });

  test("shows Sign in to Ruh Admin title", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Sign in to Ruh Admin")).toBeTruthy();
  });

  test("shows Super admin access badge", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Super admin access")).toBeTruthy();
  });

  test("submit button shows Signing in... when loading", async () => {
    // Make fetch hang to keep loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText, container } = render(<AdminLogin />);

    // Fill form and submit
    const form = container.querySelector("form");
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(getByText("Signing in...")).toBeTruthy();
    });
  });

  test("shows an access error when the session is not a platform admin", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { role: "developer" },
            appAccess: { admin: false, builder: true, customer: false },
            accessToken: "tok",
          }),
      } as Response)
    );

    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText, getByPlaceholderText, container } = render(<AdminLogin />);

    fireEvent.change(getByPlaceholderText("admin@ruh.ai"), {
      target: { value: "dev@ruh.ai" },
    });

    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, {
      target: { value: "SecurePass1!" },
    });

    const form = container.querySelector("form");
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(getByText("Platform admin access required")).toBeTruthy();
    });
  });
});
