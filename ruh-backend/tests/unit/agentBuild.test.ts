import { describe, expect, test } from "bun:test";
import { isMeaningfulSpecialistSsePayload } from "../../src/agentBuild";

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
