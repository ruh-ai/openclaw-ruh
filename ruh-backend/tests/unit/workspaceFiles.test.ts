import { describe, expect, test } from "bun:test";
import {
  classifyWorkspacePreview,
  normalizeWorkspaceRelativePath,
} from "../../src/workspaceFiles";

describe("workspaceFiles", () => {
  test("normalizes empty and dotted workspace paths to the root", () => {
    expect(normalizeWorkspaceRelativePath(undefined)).toBe("");
    expect(normalizeWorkspaceRelativePath("")).toBe("");
    expect(normalizeWorkspaceRelativePath("./")).toBe("");
    expect(normalizeWorkspaceRelativePath("reports/../reports/daily.md")).toBe("reports/daily.md");
  });

  test("rejects absolute and traversing paths", () => {
    expect(() => normalizeWorkspaceRelativePath("/etc/passwd")).toThrow("Path must be relative to the workspace root");
    expect(() => normalizeWorkspaceRelativePath("../secret.txt")).toThrow("Path must stay within the workspace root");
    expect(() => normalizeWorkspaceRelativePath("reports/\u0000daily.md")).toThrow("Path contains invalid characters");
  });

  test("classifies supported preview kinds deterministically", () => {
    expect(classifyWorkspacePreview("reports/daily.md", "text/markdown")).toBe("text");
    expect(classifyWorkspacePreview("site/preview.html", "text/html")).toBe("text");
    expect(classifyWorkspacePreview("artifacts/chart.png", "image/png")).toBe("image");
    expect(classifyWorkspacePreview("artifacts/report.pdf", "application/pdf")).toBe("pdf");
    expect(classifyWorkspacePreview("artifacts/archive.bin", "application/octet-stream")).toBe("binary");
  });
});
