import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { SkillGraphNode } from "./types";
import type { SkillRewrite } from "./eval-reflector";

// Mock the API module
const mockSendToForgeSandboxChat = mock(async () => ({ content: "" }));

mock.module("./api", () => ({
  sendToForgeSandboxChat: mockSendToForgeSandboxChat,
}));

const SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "campaign-perf",
    name: "Campaign Performance",
    source: "custom",
    status: "approved",
    depends_on: [],
    skill_md: "---\nname: campaign-perf\n---\n# Campaign Performance\nOriginal content",
  },
  {
    skill_id: "budget-mgr",
    name: "Budget Manager",
    source: "custom",
    status: "approved",
    depends_on: [],
    skill_md: "---\nname: budget-mgr\n---\n# Budget Manager\nOriginal content",
  },
];

describe("eval-mutator", () => {
  beforeEach(() => {
    mockSendToForgeSandboxChat.mockReset();
    // Reset skill_md to originals
    SKILL_GRAPH[0].skill_md = "---\nname: campaign-perf\n---\n# Campaign Performance\nOriginal content";
    SKILL_GRAPH[1].skill_md = "---\nname: budget-mgr\n---\n# Budget Manager\nOriginal content";
  });

  describe("applySkillMutations", () => {
    test("applies rewrites and updates in-memory skill graph", async () => {
      // First call: read current SKILL.md (cat), second call: write new SKILL.md
      mockSendToForgeSandboxChat
        .mockResolvedValueOnce({ content: "Original content" }) // read
        .mockResolvedValueOnce({ content: "WRITTEN" }); // write

      const { applySkillMutations } = await import("./eval-mutator");

      const rewrites: SkillRewrite[] = [
        {
          skillId: "campaign-perf",
          newContent: "---\nname: campaign-perf\n---\n# Campaign Performance\nImproved with pagination",
          rationale: "Added pagination support",
        },
      ];

      const result = await applySkillMutations(
        rewrites,
        "sandbox-1",
        "session-1",
        SKILL_GRAPH,
        1,
      );

      expect(result.applied).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(result.applied[0].skillId).toBe("campaign-perf");
      expect(result.applied[0].before).toBe("Original content");
      expect(result.applied[0].after).toContain("pagination");
      expect(result.applied[0].accepted).toBe(false);

      // In-memory graph should be updated
      expect(SKILL_GRAPH[0].skill_md).toContain("pagination");
    });

    test("records failure when skill is not in graph", async () => {
      const { applySkillMutations } = await import("./eval-mutator");

      const rewrites: SkillRewrite[] = [
        {
          skillId: "nonexistent-skill",
          newContent: "new content",
          rationale: "fix",
        },
      ];

      const result = await applySkillMutations(
        rewrites,
        "sandbox-1",
        "session-1",
        SKILL_GRAPH,
        1,
      );

      expect(result.applied).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain("not found");
    });

    test("records failure when write to container fails", async () => {
      mockSendToForgeSandboxChat
        .mockResolvedValueOnce({ content: "Original content" }) // read succeeds
        .mockRejectedValueOnce(new Error("Container error")); // write fails

      const { applySkillMutations } = await import("./eval-mutator");

      const rewrites: SkillRewrite[] = [
        {
          skillId: "campaign-perf",
          newContent: "new content",
          rationale: "fix",
        },
      ];

      const result = await applySkillMutations(
        rewrites,
        "sandbox-1",
        "session-1",
        SKILL_GRAPH,
        1,
      );

      expect(result.applied).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain("Failed to write");
    });

    test("uses skill_md from graph when container read returns FILE_NOT_FOUND", async () => {
      mockSendToForgeSandboxChat
        .mockResolvedValueOnce({ content: "FILE_NOT_FOUND" }) // read returns not found
        .mockResolvedValueOnce({ content: "WRITTEN" }); // write

      const { applySkillMutations } = await import("./eval-mutator");

      const rewrites: SkillRewrite[] = [
        {
          skillId: "campaign-perf",
          newContent: "new content",
          rationale: "fix",
        },
      ];

      const result = await applySkillMutations(
        rewrites,
        "sandbox-1",
        "session-1",
        SKILL_GRAPH,
        1,
      );

      expect(result.applied).toHaveLength(1);
      // "before" should fall back to the in-memory skill_md
      expect(result.applied[0].before).toContain("Campaign Performance");
    });
  });

  describe("revertMutations", () => {
    test("writes back original content and restores in-memory graph", async () => {
      mockSendToForgeSandboxChat.mockResolvedValue({ content: "WRITTEN" });

      const { revertMutations } = await import("./eval-mutator");

      // Simulate a mutation was applied
      SKILL_GRAPH[0].skill_md = "mutated content";

      const mutations = [
        {
          iteration: 1,
          skillId: "campaign-perf",
          before: "original content",
          after: "mutated content",
          rationale: "fix",
          accepted: false,
        },
      ];

      await revertMutations(mutations, "sandbox-1", "session-1", SKILL_GRAPH);

      // In-memory graph should be restored
      expect(SKILL_GRAPH[0].skill_md).toBe("original content");

      // Should have called the container to write back
      expect(mockSendToForgeSandboxChat).toHaveBeenCalledTimes(1);
    });
  });
});
