import { describe, expect, test, mock } from "bun:test";

// The root page calls redirect("/dashboard") which throws a NEXT_REDIRECT error.
// We mock next/navigation to capture the redirect call.
const mockRedirect = mock((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
  usePathname: () => "/",
  useRouter: () => ({ push: mock(() => {}) }),
}));

describe("RootPage", () => {
  test("redirects to /dashboard", async () => {
    const { default: Home } = await import("../app/page");
    expect(() => Home()).toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
