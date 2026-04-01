import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("ruh-frontend middleware", () => {
  test("redirects protected routes without auth cookies", () => {
    const response = middleware(new NextRequest("http://customer.test/marketplace"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://customer.test/login?redirect_url=%2Fmarketplace"
    );
  });

  test("keeps login public", () => {
    const response = middleware(
      new NextRequest("http://customer.test/login?redirect_url=%2Fmarketplace")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("allows authenticated requests through", () => {
    const request = new NextRequest("http://customer.test/marketplace");
    request.cookies.set("accessToken", "token");

    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
