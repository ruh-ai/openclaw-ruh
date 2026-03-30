import { describe, expect, test } from "bun:test";

type WorkspaceAutoSwitchReason =
  | "browser_activity"
  | "preview_detected"
  | "tool_activity"
  | "editor_file"
  | "copilot_phase";

async function loadPolicy() {
  return await import("./tab-workspace-autoswitch").catch(() => null);
}

describe("workspace auto-switch policy", () => {
  test("keeps create-flow builder tabs static for every auto-switch reason", async () => {
    const policy = await loadPolicy();
    const shouldAutoSwitchWorkspaceTab = policy?.shouldAutoSwitchWorkspaceTab;
    const reasons: WorkspaceAutoSwitchReason[] = [
      "browser_activity",
      "preview_detected",
      "tool_activity",
      "editor_file",
      "copilot_phase",
    ];

    expect(typeof shouldAutoSwitchWorkspaceTab).toBe("function");

    for (const reason of reasons) {
      expect(shouldAutoSwitchWorkspaceTab?.({ mode: "builder", reason })).toBe(false);
    }
  });

  test("preserves deployed-agent auto-switching outside builder mode", async () => {
    const policy = await loadPolicy();
    const shouldAutoSwitchWorkspaceTab = policy?.shouldAutoSwitchWorkspaceTab;
    const reasons: WorkspaceAutoSwitchReason[] = [
      "browser_activity",
      "preview_detected",
      "tool_activity",
      "editor_file",
      "copilot_phase",
    ];

    expect(typeof shouldAutoSwitchWorkspaceTab).toBe("function");

    for (const reason of reasons) {
      expect(shouldAutoSwitchWorkspaceTab?.({ mode: "agent", reason })).toBe(true);
    }
  });
});
