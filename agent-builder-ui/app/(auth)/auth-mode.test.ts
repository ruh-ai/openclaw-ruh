import { describe, expect, test } from "bun:test";
import { resolveAuthMode } from "./auth-mode";

describe("resolveAuthMode", () => {
  test("uses external mode when an auth URL is configured", () => {
    expect(resolveAuthMode("https://auth.example.com/login")).toBe("external");
  });

  test("uses local mode when auth URL is blank", () => {
    expect(resolveAuthMode("")).toBe("local");
    expect(resolveAuthMode(undefined)).toBe("local");
  });
});
