import { describe, expect, test } from "bun:test";

import {
  assertBuilderAppAccess,
  hasBuilderAppAccess,
} from "./app-access";

describe("hasBuilderAppAccess", () => {
  test("returns true when the session explicitly grants builder access", () => {
    expect(
      hasBuilderAppAccess({
        appAccess: { admin: false, builder: true, customer: false },
      })
    ).toBe(true);
  });

  test("returns false when builder access is missing", () => {
    expect(
      hasBuilderAppAccess({
        appAccess: { admin: false, builder: false, customer: true },
      })
    ).toBe(false);
  });
});

describe("assertBuilderAppAccess", () => {
  test("allows developer-org sessions through", () => {
    expect(() =>
      assertBuilderAppAccess({
        appAccess: { admin: false, builder: true, customer: false },
      })
    ).not.toThrow();
  });

  test("throws a 403-shaped error for non-builder sessions", () => {
    try {
      assertBuilderAppAccess({
        appAccess: { admin: false, builder: false, customer: true },
      });
      throw new Error("Expected assertBuilderAppAccess to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("developer organization");
      expect(
        (error as Error & { response?: { status?: number } }).response?.status
      ).toBe(403);
    }
  });
});
