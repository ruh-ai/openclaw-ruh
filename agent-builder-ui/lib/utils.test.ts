import { describe, expect, test } from "bun:test";

import { cn, capitalizeFirstLetter } from "./utils";

describe("cn", () => {
  test("merges tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  test("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  test("deduplicates conflicting tailwind utilities", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("capitalizeFirstLetter", () => {
  test("capitalizes the first character", () => {
    expect(capitalizeFirstLetter("hello")).toBe("Hello");
  });

  test("returns empty string for empty input", () => {
    expect(capitalizeFirstLetter("")).toBe("");
  });

  test("handles single character", () => {
    expect(capitalizeFirstLetter("a")).toBe("A");
  });

  test("preserves the rest of the string", () => {
    expect(capitalizeFirstLetter("hELLO")).toBe("HELLO");
  });

  test("handles already-capitalized input", () => {
    expect(capitalizeFirstLetter("Hello")).toBe("Hello");
  });
});
