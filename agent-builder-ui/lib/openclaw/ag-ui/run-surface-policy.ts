export type RunSurface = "chat" | "workspace";

export function shouldAppendUserMessageToTranscript(surface: RunSurface, silent: boolean): boolean {
  if (silent) {
    return false;
  }

  return surface === "chat";
}

export function shouldShowLiveTranscript(surface: RunSurface): boolean {
  return surface === "chat";
}

export function shouldHideCompletedRunFromTranscript(
  surface: RunSurface,
  artifacts: {
    hasSteps: boolean;
    hasBrowser: boolean;
    hasPlan: boolean;
  },
): boolean {
  if (surface !== "workspace") {
    return false;
  }

  return artifacts.hasSteps || artifacts.hasBrowser || artifacts.hasPlan;
}
