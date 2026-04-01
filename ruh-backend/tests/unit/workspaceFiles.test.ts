import { describe, expect, test } from "bun:test";
import {
  classifyWorkspaceArtifactType,
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

  test("falls back to file extensions when mime metadata is missing or generic", () => {
    expect(classifyWorkspacePreview("reports/DAILY.MD", "")).toBe("text");
    expect(classifyWorkspacePreview("artifacts/preview.PNG", "application/octet-stream")).toBe("image");
    expect(classifyWorkspacePreview("artifacts/report.PDF", undefined)).toBe("pdf");
    expect(classifyWorkspacePreview("artifacts/blob.bin", null)).toBe("binary");
  });

  test("classifies artifact types independently of preview kind", () => {
    expect(classifyWorkspaceArtifactType("site/index.html", "text/html")).toBe("webpage");
    expect(classifyWorkspaceArtifactType("reports/daily.md", "text/markdown")).toBe("document");
    expect(classifyWorkspaceArtifactType("data/summary.json", "application/json")).toBe("data");
    expect(classifyWorkspaceArtifactType("src/app.tsx", "text/typescript")).toBe("code");
    expect(classifyWorkspaceArtifactType("artifacts/chart.png", "image/png")).toBe("image");
    expect(classifyWorkspaceArtifactType("downloads/bundle.zip", "application/zip")).toBe("archive");
    expect(classifyWorkspaceArtifactType("artifacts/blob.bin", "application/octet-stream")).toBe("other");
  });
});
