import { describe, expect, test } from "bun:test";
import {
  shouldAppendUserMessageToTranscript,
  shouldShowLiveTranscript,
  shouldHideCompletedRunFromTranscript,
} from "./run-surface-policy";

describe("shouldAppendUserMessageToTranscript", () => {
  test("returns false when silent is true regardless of surface", () => {
    expect(shouldAppendUserMessageToTranscript("chat", true)).toBe(false);
    expect(shouldAppendUserMessageToTranscript("workspace", true)).toBe(false);
  });

  test("returns true for chat surface when not silent", () => {
    expect(shouldAppendUserMessageToTranscript("chat", false)).toBe(true);
  });

  test("returns false for workspace surface when not silent", () => {
    expect(shouldAppendUserMessageToTranscript("workspace", false)).toBe(false);
  });
});

describe("shouldShowLiveTranscript", () => {
  test("returns true for chat surface", () => {
    expect(shouldShowLiveTranscript("chat")).toBe(true);
  });

  test("returns false for workspace surface", () => {
    expect(shouldShowLiveTranscript("workspace")).toBe(false);
  });
});

describe("shouldHideCompletedRunFromTranscript", () => {
  test("returns false for chat surface regardless of artifacts", () => {
    expect(shouldHideCompletedRunFromTranscript("chat", { hasSteps: true, hasBrowser: true, hasPlan: true })).toBe(false);
  });

  test("returns true for workspace surface with steps", () => {
    expect(shouldHideCompletedRunFromTranscript("workspace", { hasSteps: true, hasBrowser: false, hasPlan: false })).toBe(true);
  });

  test("returns false for workspace surface with no artifacts", () => {
    expect(shouldHideCompletedRunFromTranscript("workspace", { hasSteps: false, hasBrowser: false, hasPlan: false })).toBe(false);
  });
});
