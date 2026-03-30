import { describe, expect, test } from "bun:test";

/**
 * Tests for WorkspacePanel logic: tree building from flat file list,
 * sort order (dirs first, then alphabetical), and file category detection.
 */

// Replicate the fileCategory logic from WorkspacePanel
const FILE_ICONS: Record<string, string> = {
  md: "doc", json: "data", ts: "code", js: "code", py: "code",
  sh: "code", yaml: "config", yml: "config", toml: "config",
};

function fileCategory(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "file";
}

// Replicate the tree-building logic
interface TreeNode {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

function buildTree(items: Array<{ path: string; name: string; type: string }>): TreeNode[] {
  const root: TreeNode[] = [];
  function ensureDir(children: TreeNode[], dirName: string, dirPath: string): TreeNode {
    let existing = children.find((c) => c.type === "directory" && c.name === dirName);
    if (!existing) {
      existing = { path: dirPath, name: dirName, type: "directory", children: [] };
      children.push(existing);
    }
    return existing;
  }
  for (const item of items) {
    const parts = item.path.split("/");
    const fileName = parts.pop()!;
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      const dir = ensureDir(current, parts[i], dirPath);
      current = dir.children!;
    }
    current.push({ path: item.path, name: fileName, type: item.type === "directory" ? "directory" : "file" });
  }
  // Sort: directories first, then alphabetical
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) { if (n.children) sortNodes(n.children); }
  }
  sortNodes(root);
  return root;
}

describe("fileCategory", () => {
  test("classifies markdown as doc", () => {
    expect(fileCategory("SOUL.md")).toBe("doc");
    expect(fileCategory("README.md")).toBe("doc");
  });

  test("classifies json as data", () => {
    expect(fileCategory("config.json")).toBe("data");
  });

  test("classifies code files", () => {
    expect(fileCategory("index.ts")).toBe("code");
    expect(fileCategory("main.py")).toBe("code");
    expect(fileCategory("run.sh")).toBe("code");
  });

  test("classifies config files", () => {
    expect(fileCategory("config.yaml")).toBe("config");
    expect(fileCategory("settings.toml")).toBe("config");
  });

  test("returns 'file' for unknown extensions", () => {
    expect(fileCategory("image.png")).toBe("file");
    expect(fileCategory("data.csv")).toBe("file");
  });
});

describe("buildTree", () => {
  test("builds flat files at root level", () => {
    const tree = buildTree([
      { path: "SOUL.md", name: "SOUL.md", type: "file" },
      { path: "README.md", name: "README.md", type: "file" },
    ]);
    expect(tree.length).toBe(2);
    expect(tree[0].name).toBe("README.md"); // alphabetical
    expect(tree[1].name).toBe("SOUL.md");
  });

  test("creates directory nodes for nested paths", () => {
    const tree = buildTree([
      { path: "skills/optimizer/SKILL.md", name: "SKILL.md", type: "file" },
    ]);
    expect(tree.length).toBe(1);
    expect(tree[0].type).toBe("directory");
    expect(tree[0].name).toBe("skills");
    expect(tree[0].children!.length).toBe(1);
    expect(tree[0].children![0].name).toBe("optimizer");
    expect(tree[0].children![0].children![0].name).toBe("SKILL.md");
  });

  test("directories sort before files", () => {
    const tree = buildTree([
      { path: "SOUL.md", name: "SOUL.md", type: "file" },
      { path: "skills/a/SKILL.md", name: "SKILL.md", type: "file" },
      { path: "tools/google-ads.json", name: "google-ads.json", type: "file" },
    ]);
    expect(tree[0].type).toBe("directory"); // skills/
    expect(tree[1].type).toBe("directory"); // tools/
    expect(tree[2].type).toBe("file"); // SOUL.md
  });

  test("handles empty input", () => {
    const tree = buildTree([]);
    expect(tree.length).toBe(0);
  });

  test("groups files under same directory", () => {
    const tree = buildTree([
      { path: "skills/a/SKILL.md", name: "SKILL.md", type: "file" },
      { path: "skills/b/SKILL.md", name: "SKILL.md", type: "file" },
    ]);
    expect(tree.length).toBe(1); // one skills/ dir
    expect(tree[0].children!.length).toBe(2); // a/ and b/
  });
});
