import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

function makeRequest(
  path: string,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL(path, "http://localhost:3001");
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("middleware", () => {
  describe("public routes", () => {
    test("allows /login through without cookies", () => {
      const response = middleware(makeRequest("/login"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    test("allows /login sub-paths through", () => {
      const response = middleware(makeRequest("/login/callback"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  });

  describe("protected routes without auth cookies", () => {
    test("redirects to /login with redirect_url param", () => {
      const response = middleware(makeRequest("/dashboard"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect_url")).toBe("/dashboard");
    });

    test("preserves query string in redirect_url", () => {
      const response = middleware(makeRequest("/agents?tab=active"));
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("redirect_url")).toBe(
        "/agents?tab=active"
      );
    });
  });

  describe("protected routes with auth cookies", () => {
    test("passes through when accessToken cookie is present", () => {
      const response = middleware(
        makeRequest("/dashboard", { accessToken: "tok_abc" })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    test("passes through when only refreshToken cookie is present", () => {
      const response = middleware(
        makeRequest("/dashboard", { refreshToken: "ref_xyz" })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  });
});
