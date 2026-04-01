import { describe, expect, test } from "bun:test";

import { assertAdminAppAccess, hasAdminAppAccess } from "./app-access";

describe("hasAdminAppAccess", () => {
  test("returns true for platform-admin sessions", () => {
    expect(
      hasAdminAppAccess({
        appAccess: { admin: true, builder: false, customer: false },
      })
    ).toBe(true);
  });

  test("returns false for non-admin sessions", () => {
    expect(
      hasAdminAppAccess({
        appAccess: { admin: false, builder: true, customer: false },
      })
    ).toBe(false);
  });
});

describe("assertAdminAppAccess", () => {
  test("allows admin sessions", () => {
    expect(() =>
      assertAdminAppAccess({
        appAccess: { admin: true, builder: false, customer: false },
      })
    ).not.toThrow();
  });

  test("throws a 403-shaped error for non-admin sessions", () => {
    try {
      assertAdminAppAccess({
        appAccess: { admin: false, builder: false, customer: true },
      });
      throw new Error("Expected assertAdminAppAccess to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Platform admin");
      expect(
        (error as Error & { response?: { status?: number } }).response?.status
      ).toBe(403);
    }
  });
});
