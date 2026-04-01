import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

describe("admin-ui middleware", () => {
  test("redirects protected routes without auth cookies", () => {
    const response = middleware(new NextRequest("http://admin.test/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://admin.test/login?redirect_url=%2Fdashboard"
    );
  });

  test("keeps login public", () => {
    const response = middleware(
      new NextRequest("http://admin.test/login?redirect_url=%2Fdashboard")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
