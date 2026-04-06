import { describe, expect, test, mock, beforeEach } from "bun:test";

let redirectTarget: string | null = null;

mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    redirectTarget = url;
    throw new Error("NEXT_REDIRECT");
  },
  usePathname: () => "/",
  useRouter: () => ({ push: mock(() => {}) }),
}));

// Import once — the mock is already in place
const { default: Home } = await import("../app/page");

describe("Home (root page)", () => {
  beforeEach(() => {
    redirectTarget = null;
  });

  test("redirects to /dashboard", () => {
    try {
      Home();
    } catch {
      // redirect throws by design
    }
    expect(redirectTarget).toBe("/dashboard");
  });
});
