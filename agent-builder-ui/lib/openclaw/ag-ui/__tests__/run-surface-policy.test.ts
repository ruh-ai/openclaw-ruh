import { describe, expect, test } from "bun:test";
import {
  shouldAppendUserMessageToTranscript,
  shouldHideCompletedRunFromTranscript,
  shouldShowLiveTranscript,
  type RunSurface,
} from "../run-surface-policy";

describe("run-surface-policy", () => {
  test("chat runs remain visible in the transcript", () => {
    const surface: RunSurface = "chat";

    expect(shouldAppendUserMessageToTranscript(surface, false)).toBe(true);
    expect(
      shouldHideCompletedRunFromTranscript(surface, {
        hasSteps: true,
        hasBrowser: false,
        hasPlan: false,
      }),
    ).toBe(false);
    expect(shouldShowLiveTranscript(surface)).toBe(true);
  });

  test("workspace runs suppress transcript rendering when workspace artifacts exist", () => {
    const surface: RunSurface = "workspace";

    expect(shouldAppendUserMessageToTranscript(surface, false)).toBe(false);
    expect(
      shouldHideCompletedRunFromTranscript(surface, {
        hasSteps: true,
        hasBrowser: false,
        hasPlan: false,
      }),
    ).toBe(true);
    expect(shouldShowLiveTranscript(surface)).toBe(false);
  });

  test("workspace runs can still fall back to transcript when no workspace artifact was produced", () => {
    const surface: RunSurface = "workspace";

    expect(
      shouldHideCompletedRunFromTranscript(surface, {
        hasSteps: false,
        hasBrowser: false,
        hasPlan: false,
      }),
    ).toBe(false);
  });

  test("silent chat prompts still suppress only the user transcript bubble", () => {
    const surface: RunSurface = "chat";

    expect(shouldAppendUserMessageToTranscript(surface, true)).toBe(false);
    expect(shouldShowLiveTranscript(surface)).toBe(true);
  });
});
