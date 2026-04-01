import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, fireEvent, waitFor } from "@testing-library/react";

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

  test("renders sign in button", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Sign In")).toBeTruthy();
  });

  test("shows Ruh Admin title", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Ruh Admin")).toBeTruthy();
  });

  test("shows Platform Administration subtitle", async () => {
    const { default: AdminLogin } = await import("../app/(auth)/login/page");
    const { getByText } = render(<AdminLogin />);
    expect(getByText("Platform Administration")).toBeTruthy();
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
});
