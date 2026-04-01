import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

describe("middleware", () => {
  test("redirects protected routes without auth cookies", () => {
    const response = middleware(
      new NextRequest("http://builder.test/agents/create?tab=review")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://builder.test/authenticate?redirect_url=%2Fagents%2Fcreate%3Ftab%3Dreview"
    );
  });

  test("keeps authenticate public", () => {
    const response = middleware(
      new NextRequest("http://builder.test/authenticate?redirect_url=%2Fagents")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("allows authenticated requests through", () => {
    const request = new NextRequest("http://builder.test/agents");
    request.cookies.set("accessToken", "token");

    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("does not bypass protected routes in local development", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const response = middleware(
        new NextRequest("http://builder.test/agents/create")
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://builder.test/authenticate?redirect_url=%2Fagents%2Fcreate"
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
