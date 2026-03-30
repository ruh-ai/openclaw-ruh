import { describe, expect, test } from "bun:test";

/**
 * Tests for ShipDialog file categorization logic.
 * The dialog reads workspace files and separates them into
 * SOUL content, skills, and config before pushing to GitHub.
 */

interface FileContent {
  path: string;
  content: string;
}

/**
 * Mirrors the categorization logic from ShipDialog.handleShip
 */
function categorizeWorkspaceFiles(
  files: FileContent[],
  agentName: string,
): {
  soulContent: string;
  skills: Record<string, string>;
  config: Record<string, string>;
} {
  const soulFile = files.find((f) => f.path === "SOUL.md" || f.path.endsWith("/SOUL.md"));
  const soulContent = soulFile?.content ?? `# ${agentName}\n\nAgent template.\n`;

  const skills: Record<string, string> = {};
  const config: Record<string, string> = {};

  for (const file of files) {
    if (file.path === soulFile?.path) continue;
    if (file.path.startsWith("skills/")) {
      const skillKey = file.path.replace(/^skills\//, "").replace(/\/SKILL\.md$/, "");
      if (file.path.endsWith("SKILL.md")) {
        skills[skillKey] = file.content;
      } else {
        config[file.path] = file.content;
      }
    } else {
      config[file.path] = file.content;
    }
  }

  return { soulContent, skills, config };
}

describe("categorizeWorkspaceFiles", () => {
  test("extracts SOUL.md content", () => {
    const result = categorizeWorkspaceFiles(
      [{ path: "SOUL.md", content: "# My Agent\nI am helpful." }],
      "Test",
    );
    expect(result.soulContent).toBe("# My Agent\nI am helpful.");
    expect(Object.keys(result.skills).length).toBe(0);
    expect(Object.keys(result.config).length).toBe(0);
  });

  test("uses fallback when SOUL.md is missing", () => {
    const result = categorizeWorkspaceFiles([], "Fallback Agent");
    expect(result.soulContent).toContain("Fallback Agent");
  });

  test("categorizes skill files", () => {
    const result = categorizeWorkspaceFiles(
      [
        { path: "SOUL.md", content: "soul" },
        { path: "skills/optimizer/SKILL.md", content: "# Optimizer skill" },
        { path: "skills/reporter/SKILL.md", content: "# Reporter skill" },
      ],
      "Test",
    );
    expect(result.skills["optimizer"]).toBe("# Optimizer skill");
    expect(result.skills["reporter"]).toBe("# Reporter skill");
  });

  test("puts non-SKILL files under skills/ into config", () => {
    const result = categorizeWorkspaceFiles(
      [
        { path: "SOUL.md", content: "soul" },
        { path: "skills/optimizer/config.json", content: "{}" },
      ],
      "Test",
    );
    expect(Object.keys(result.skills).length).toBe(0);
    expect(result.config["skills/optimizer/config.json"]).toBe("{}");
  });

  test("puts other files into config", () => {
    const result = categorizeWorkspaceFiles(
      [
        { path: "SOUL.md", content: "soul" },
        { path: "tools/google-ads.json", content: "{}" },
        { path: "triggers/schedule.json", content: "[]" },
      ],
      "Test",
    );
    expect(result.config["tools/google-ads.json"]).toBe("{}");
    expect(result.config["triggers/schedule.json"]).toBe("[]");
  });

  test("does not include SOUL.md in config or skills", () => {
    const result = categorizeWorkspaceFiles(
      [
        { path: "SOUL.md", content: "soul content" },
        { path: "README.md", content: "readme" },
      ],
      "Test",
    );
    expect(result.soulContent).toBe("soul content");
    expect(result.config["SOUL.md"]).toBeUndefined();
    expect(result.config["README.md"]).toBe("readme");
  });
});
