import { describe, expect, test } from "bun:test";
import {
  buildCommitIterationCommand,
  chooseSkillsBuildPath,
  isMeaningfulSpecialistSsePayload,
  isSpecialistTimeoutError,
} from "../../src/agentBuild";

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

describe("buildCommitIterationCommand", () => {
  test("composes a single command pipeline that ends with rev-parse --short HEAD", () => {
    const cmd = buildCommitIterationCommand("iter 1: google-ads-credential-check");
    expect(cmd).toContain("git init -q");
    expect(cmd).toContain("git config user.email 'architect@ruh.ai'");
    expect(cmd).toContain("git config user.name 'Architect'");
    expect(cmd).toContain("git add -A");
    expect(cmd).toContain("--allow-empty");
    expect(cmd).toContain("git rev-parse --short HEAD");
    // The pipeline must use && so a failure in any step short-circuits
    expect(cmd).toContain(" && ");
  });

  test("includes the user-supplied message in the commit", () => {
    const cmd = buildCommitIterationCommand("iter 7: rename optimizer skill");
    expect(cmd).toContain("iter 7: rename optimizer skill");
  });

  test("collapses multi-line messages to a single line", () => {
    const cmd = buildCommitIterationCommand("iter 2: line one\nline two\r\nline three");
    expect(cmd).not.toContain("\n");
    expect(cmd).not.toContain("\r");
    expect(cmd).toContain("line one line two line three");
  });

  test("truncates very long messages to 200 chars", () => {
    const long = "iter 99: " + "x".repeat(500);
    const cmd = buildCommitIterationCommand(long);
    // Find the quoted commit message portion and verify it's bounded.
    // shellQuote wraps in single quotes, so locate the message between -m '...'.
    const match = cmd.match(/git commit -m '([^']+)' /);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(200);
  });

  test("safely escapes single quotes in messages so the shell pipeline stays valid", () => {
    const cmd = buildCommitIterationCommand("iter 3: it's working");
    // The command must be runnable bash — single quotes inside the message
    // need to be escaped via shellQuote, not raw.
    expect(cmd).not.toMatch(/-m 'iter 3: it's working'/);
  });
});

describe("chooseSkillsBuildPath", () => {
  test("routes to iterated when the v2 flag is on and at least one skill is owned", () => {
    expect(chooseSkillsBuildPath({ ownedSkillCount: 1, pairProgrammerBuildV2: true })).toBe("iterated");
    expect(chooseSkillsBuildPath({ ownedSkillCount: 9, pairProgrammerBuildV2: true })).toBe("iterated");
  });

  test("falls back to chunked for >3 skills when the v2 flag is off", () => {
    expect(chooseSkillsBuildPath({ ownedSkillCount: 4, pairProgrammerBuildV2: false })).toBe("chunked");
    expect(chooseSkillsBuildPath({ ownedSkillCount: 9, pairProgrammerBuildV2: false })).toBe("chunked");
  });

  test("falls through to single-shot for ≤3 skills when the v2 flag is off", () => {
    expect(chooseSkillsBuildPath({ ownedSkillCount: 0, pairProgrammerBuildV2: false })).toBe("single");
    expect(chooseSkillsBuildPath({ ownedSkillCount: 1, pairProgrammerBuildV2: false })).toBe("single");
    expect(chooseSkillsBuildPath({ ownedSkillCount: 3, pairProgrammerBuildV2: false })).toBe("single");
  });

  test("the v2 flag does not engage when there are zero skills to write", () => {
    // With no skills owned by the target, the iteration loop has nothing
    // to iterate; let the existing path handle the empty case.
    expect(chooseSkillsBuildPath({ ownedSkillCount: 0, pairProgrammerBuildV2: true })).toBe("single");
  });
});
