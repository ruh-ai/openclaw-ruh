import { describe, expect, test } from "bun:test";

import {
  buildWorkspaceMemorySystemMessage,
  hasWorkspaceMemory,
  normalizeWorkspaceMemory,
} from "./workspace-memory";

describe("workspace memory helpers", () => {
  test("normalizes optional fields into a stable client shape", () => {
    expect(normalizeWorkspaceMemory({
      instructions: "Keep summaries tight",
      continuity_summary: "Need launch sign-off",
      pinned_paths: ["plans/launch.md"],
      updated_at: "2026-03-25T18:00:00.000Z",
    })).toEqual({
      instructions: "Keep summaries tight",
      continuitySummary: "Need launch sign-off",
      pinnedPaths: ["plans/launch.md"],
      updatedAt: "2026-03-25T18:00:00.000Z",
    });
  });

  test("detects when workspace memory should be applied to a new chat", () => {
    expect(hasWorkspaceMemory({
      instructions: "",
      continuitySummary: "",
      pinnedPaths: [],
      updatedAt: null,
    })).toBe(false);

    expect(hasWorkspaceMemory({
      instructions: "Keep summaries tight",
      continuitySummary: "",
      pinnedPaths: [],
      updatedAt: null,
    })).toBe(true);
  });

  test("builds one bounded system message for a new conversation", () => {
    expect(buildWorkspaceMemorySystemMessage({
      instructions: "Keep summaries tight",
      continuitySummary: "Need launch sign-off",
      pinnedPaths: ["plans/launch.md", "reports/q1-summary.md"],
      updatedAt: "2026-03-25T18:00:00.000Z",
    })).toContain("Workspace memory");
  });
});
