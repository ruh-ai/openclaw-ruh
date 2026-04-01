import { describe, expect, test, mock } from "bun:test";

let redirectTarget: string | null = null;

mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    redirectTarget = url;
    throw new Error("NEXT_REDIRECT");
  },
  usePathname: () => "/",
  useRouter: () => ({ push: mock(() => {}) }),
}));

describe("Home (root page)", () => {
  test("redirects to /dashboard", async () => {
    redirectTarget = null;
    const { default: Home } = await import("../app/page");
    try {
      Home();
    } catch {
      // redirect throws by design
    }
    expect(redirectTarget).toBe("/dashboard");
  });
});
