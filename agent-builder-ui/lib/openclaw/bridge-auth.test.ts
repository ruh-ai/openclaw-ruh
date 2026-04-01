import { describe, expect, mock, test } from "bun:test";

import {
  RouteAuthError,
  parseCookieValue,
  requireAuthenticatedBridgeSession,
  validateSameOrigin,
} from "./bridge-auth";

describe("bridge-auth", () => {
  test("parses and decodes cookie values", () => {
    expect(parseCookieValue("foo=bar; accessToken=abc%20123", "accessToken")).toBe("abc 123");
    expect(parseCookieValue("foo=bar", "accessToken")).toBeNull();
  });

  test("rejects mismatched origins before auth validation", () => {
    expect(() =>
      validateSameOrigin(
        new Request("http://localhost/api/openclaw", {
          headers: {
            origin: "https://evil.example",
          },
        }) as any,
      ),
    ).toThrow(RouteAuthError);
  });

  test("validates the current session against the backend", async () => {
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://backend.test/users/me");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-123");

      return new Response(JSON.stringify({ id: "user-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      requireAuthenticatedBridgeSession(
        new Request("http://localhost/api/openclaw", {
          headers: {
            cookie: "accessToken=token-123",
            origin: "http://localhost",
          },
        }) as any,
        {
          backendUrl: "http://backend.test",
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).resolves.toBeUndefined();
  });

  test("allows localhost development requests to bypass backend session validation", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("fetch should not be called when the local dev bypass is active");
    });

    await expect(
      requireAuthenticatedBridgeSession(
        new Request("http://localhost:3001/api/openclaw", {
          headers: {
            origin: "http://localhost:3001",
          },
        }) as any,
        {
          backendUrl: "http://localhost:8000",
          nodeEnv: "development",
          allowLocalDevelopmentBypass: true,
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).resolves.toBeUndefined();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("does not bypass auth outside local development", async () => {
    await expect(
      requireAuthenticatedBridgeSession(
        new Request("http://localhost:3001/api/openclaw", {
          headers: {
            origin: "http://localhost:3001",
          },
        }) as any,
        {
          backendUrl: "http://localhost:8000",
          nodeEnv: "test",
          allowLocalDevelopmentBypass: true,
        },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  test("does not bypass auth when the backend target is not local", async () => {
    await expect(
      requireAuthenticatedBridgeSession(
        new Request("http://localhost:3001/api/openclaw", {
          headers: {
            origin: "http://localhost:3001",
          },
        }) as any,
        {
          backendUrl: "http://backend.test",
          nodeEnv: "development",
          allowLocalDevelopmentBypass: true,
        },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  test("fails closed when the session is missing", async () => {
    await expect(
      requireAuthenticatedBridgeSession(
        new Request("http://localhost/api/openclaw", {
          headers: {
            origin: "http://localhost",
          },
        }) as any,
        {
          backendUrl: "http://backend.test",
        },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });
});
