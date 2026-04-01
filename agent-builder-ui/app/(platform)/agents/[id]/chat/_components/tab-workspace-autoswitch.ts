import type { ChatMode } from "@/lib/openclaw/ag-ui/types";

export type WorkspaceAutoSwitchReason =
  | "browser_activity"
  | "preview_detected"
  | "tool_activity"
  | "editor_file"
  | "copilot_phase";

export function shouldAutoSwitchWorkspaceTab({
  mode,
}: {
  mode?: ChatMode;
  reason: WorkspaceAutoSwitchReason;
}): boolean {
  return mode !== "builder";
}
