import { describe, expect, test } from "bun:test";

import { DEV_MOCK_BAR_QUERY_PARAM, shouldShowDevMockBar } from "./dev-mock-bar";

describe("dev-mock-bar visibility", () => {
  test("fails closed outside explicit opt-in even in development", () => {
    expect(DEV_MOCK_BAR_QUERY_PARAM).toBe("devMockBar");
    expect(shouldShowDevMockBar("development", null)).toBe(false);
    expect(shouldShowDevMockBar("development", "0")).toBe(false);
    expect(shouldShowDevMockBar("development", "false")).toBe(false);
  });

  test("shows the banner only for explicit truthy opt-in values in development", () => {
    expect(shouldShowDevMockBar("development", "1")).toBe(true);
    expect(shouldShowDevMockBar("development", "true")).toBe(true);
    expect(shouldShowDevMockBar("development", "yes")).toBe(true);
  });

  test("stays hidden outside development even when the query param is present", () => {
    expect(shouldShowDevMockBar("production", "1")).toBe(false);
    expect(shouldShowDevMockBar("test", "true")).toBe(false);
    expect(shouldShowDevMockBar(undefined, "yes")).toBe(false);
  });
});
