import { describe, expect, test } from "bun:test";
import { isMeaningfulSpecialistSsePayload, isSpecialistTimeoutError } from "../../src/agentBuild";

describe("isMeaningfulSpecialistSsePayload", () => {
  test("does not treat empty gateway keepalives as specialist activity", () => {
    expect(isMeaningfulSpecialistSsePayload("")).toBe(false);
    expect(isMeaningfulSpecialistSsePayload("{}")).toBe(false);
    expect(isMeaningfulSpecialistSsePayload('{"choices":[{"delta":{}}]}')).toBe(false);
  });

  test("treats streamed content and build markers as specialist activity", () => {
    expect(isMeaningfulSpecialistSsePayload('{"choices":[{"delta":{"content":"working"}}]}')).toBe(true);
    expect(isMeaningfulSpecialistSsePayload('{"type":"file_written","path":"db/types.ts"}')).toBe(true);
    expect(isMeaningfulSpecialistSsePayload('{"type":"specialist_done","specialist":"database","files":["db/types.ts"]}')).toBe(true);
  });
});

describe("isSpecialistTimeoutError", () => {
  test("classifies terminal timeout and abort errors", () => {
    expect(isSpecialistTimeoutError(new Error("Specialist stream timed out after 600s"))).toBe(true);
    expect(isSpecialistTimeoutError(new DOMException("The operation was aborted", "AbortError"))).toBe(true);
    expect(isSpecialistTimeoutError(new DOMException("The operation timed out", "TimeoutError"))).toBe(true);
  });

  test("does not classify ordinary specialist failures as timeouts", () => {
    expect(isSpecialistTimeoutError(new Error("database did not produce expected file(s): db/types.ts"))).toBe(false);
    expect(isSpecialistTimeoutError("Gateway returned 500")).toBe(false);
  });
});
