import { describe, expect, test } from "bun:test";

import { shouldApplyWorkspaceRehydration } from "./workspace-rehydration";

describe("workspace rehydration guards", () => {
  test("rejects stale workspace reads from a previous sandbox", () => {
    expect(shouldApplyWorkspaceRehydration({
      requestedSandboxId: "old-sandbox",
      currentSandboxId: "new-sandbox",
    })).toBe(false);
  });

  test("allows workspace reads for the current sandbox", () => {
    expect(shouldApplyWorkspaceRehydration({
      requestedSandboxId: "current-sandbox",
      currentSandboxId: "current-sandbox",
    })).toBe(true);
  });

  test("rejects workspace reads when the current sandbox is not known", () => {
    expect(shouldApplyWorkspaceRehydration({
      requestedSandboxId: "old-sandbox",
      currentSandboxId: null,
    })).toBe(false);
  });
});
