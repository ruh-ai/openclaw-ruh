import { getSecurityHeaders } from "../../lib/security-headers";
import nextConfig from "../../next.config";

describe("ruh frontend security headers", () => {
  test("emits baseline browser security headers for all routes", async () => {
    expect(typeof nextConfig.headers).toBe("function");

    const routes = await nextConfig.headers?.();
    const rootHeaders = routes?.find((entry) => entry.source === "/:path*");
    const headers = new Map(rootHeaders?.headers.map((header) => [header.key, header.value]));
    const csp = headers.get("Content-Security-Policy");

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    );

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' http://localhost:8000");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("falls back to the default API origin when NEXT_PUBLIC_API_URL is invalid", () => {
    const headers = new Map(
      getSecurityHeaders({
        apiUrl: "not-a-valid-url",
        nodeEnv: "production",
      }).map((header) => [header.key, header.value]),
    );

    expect(headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self' http://localhost:8000",
    );
    expect(headers.get("Content-Security-Policy")).not.toContain("not-a-valid-url");
  });

  test("includes documented development-only websocket and eval allowances", () => {
    const headers = new Map(
      getSecurityHeaders({
        apiUrl: "http://localhost:8000/api",
        nodeEnv: "development",
      }).map((header) => [header.key, header.value]),
    );
    const csp = headers.get("Content-Security-Policy");

    expect(csp).toContain("connect-src 'self' http://localhost:8000 ws: wss:");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});
