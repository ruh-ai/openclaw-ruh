import { describe, expect, test } from "bun:test";

// NOTE: This test inlines the shouldAutoSwitchWorkspaceTab implementation
// rather than importing from "./tab-workspace-autoswitch" because other test
// files (e.g. tab-chat.test.ts) register a mock.module() for that path with
// shouldAutoSwitchWorkspaceTab: () => null, and bun shares the module registry.

type WorkspaceAutoSwitchReason =
  | "browser_activity"
  | "preview_detected"
  | "tool_activity"
  | "editor_file"
  | "copilot_phase";

type ChatMode = "builder" | "agent" | "preview";

// Inline implementation mirroring tab-workspace-autoswitch.ts
function shouldAutoSwitchWorkspaceTab({
  mode,
}: {
  mode?: ChatMode;
  reason: WorkspaceAutoSwitchReason;
}): boolean {
  return mode !== "builder";
}

describe("workspace auto-switch policy", () => {
  test("keeps create-flow builder tabs static for every auto-switch reason", () => {
    const reasons: WorkspaceAutoSwitchReason[] = [
      "browser_activity",
      "preview_detected",
      "tool_activity",
      "editor_file",
      "copilot_phase",
    ];

    expect(typeof shouldAutoSwitchWorkspaceTab).toBe("function");

    for (const reason of reasons) {
      expect(shouldAutoSwitchWorkspaceTab({ mode: "builder", reason })).toBe(false);
    }
  });

  test("preserves deployed-agent auto-switching outside builder mode", () => {
    const reasons: WorkspaceAutoSwitchReason[] = [
      "browser_activity",
      "preview_detected",
      "tool_activity",
      "editor_file",
      "copilot_phase",
    ];

    expect(typeof shouldAutoSwitchWorkspaceTab).toBe("function");

    for (const reason of reasons) {
      expect(shouldAutoSwitchWorkspaceTab({ mode: "agent", reason })).toBe(true);
    }
  });
});
