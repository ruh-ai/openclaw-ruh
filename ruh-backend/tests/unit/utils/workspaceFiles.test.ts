import { describe, expect, test } from "bun:test";
import {
  classifyWorkspaceArtifactType,
  classifyWorkspacePreview,
  normalizeWorkspaceRelativePath,
  guessWorkspaceMimeType,
  createWorkspaceListCommand,
  createWorkspaceReadCommand,
  createWorkspaceDownloadCommand,
  createWorkspaceHandoffCommand,
  createWorkspaceArchiveCommand,
  createWorkspaceStatusCommand,
} from "../../../src/workspaceFiles";

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

describe("guessWorkspaceMimeType", () => {
  test("returns correct mime types for common extensions", () => {
    expect(guessWorkspaceMimeType("file.md")).toBe("text/markdown");
    expect(guessWorkspaceMimeType("file.markdown")).toBe("text/markdown");
    expect(guessWorkspaceMimeType("data.json")).toBe("application/json");
    expect(guessWorkspaceMimeType("config.yml")).toBe("application/yaml");
    expect(guessWorkspaceMimeType("config.yaml")).toBe("application/yaml");
    expect(guessWorkspaceMimeType("index.html")).toBe("text/html");
    expect(guessWorkspaceMimeType("index.htm")).toBe("text/html");
    expect(guessWorkspaceMimeType("style.css")).toBe("text/css");
    expect(guessWorkspaceMimeType("app.js")).toBe("text/javascript");
    expect(guessWorkspaceMimeType("app.mjs")).toBe("text/javascript");
    expect(guessWorkspaceMimeType("app.cjs")).toBe("text/javascript");
    expect(guessWorkspaceMimeType("types.ts")).toBe("text/typescript");
    expect(guessWorkspaceMimeType("component.tsx")).toBe("text/typescript");
    expect(guessWorkspaceMimeType("data.csv")).toBe("text/csv");
    expect(guessWorkspaceMimeType("config.xml")).toBe("application/xml");
    expect(guessWorkspaceMimeType("doc.pdf")).toBe("application/pdf");
    expect(guessWorkspaceMimeType("image.png")).toBe("image/png");
    expect(guessWorkspaceMimeType("photo.jpg")).toBe("image/jpeg");
    expect(guessWorkspaceMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(guessWorkspaceMimeType("anim.gif")).toBe("image/gif");
    expect(guessWorkspaceMimeType("anim.webp")).toBe("image/webp");
    expect(guessWorkspaceMimeType("icon.svg")).toBe("image/svg+xml");
    expect(guessWorkspaceMimeType("data.bin")).toBe("application/octet-stream");
  });
});

describe("createWorkspaceListCommand", () => {
  test("returns a node -e shell command containing list mode payload", () => {
    const cmd = createWorkspaceListCommand("reports", 2, 50);
    expect(cmd).toContain("node");
    expect(cmd).toContain('"mode":"list"');
    expect(cmd).toContain('"path":"reports"');
    expect(cmd).toContain('"depth":2');
    expect(cmd).toContain('"limit":50');
    expect(cmd).toMatch(/2>&1$/);
  });

  test("handles root path (empty string)", () => {
    const cmd = createWorkspaceListCommand("", 1, 200);
    expect(cmd).toContain('"mode":"list"');
    expect(cmd).toContain('"path":""');
  });
});

describe("createWorkspaceReadCommand", () => {
  test("returns a command with read mode and default maxBytes", () => {
    const cmd = createWorkspaceReadCommand("reports/daily.md");
    expect(cmd).toContain('"mode":"read"');
    expect(cmd).toContain('"path":"reports/daily.md"');
    expect(cmd).toContain('"maxBytes":200000');
  });

  test("accepts a custom maxBytes value", () => {
    const cmd = createWorkspaceReadCommand("data/large.json", 50000);
    expect(cmd).toContain('"maxBytes":50000');
  });
});

describe("createWorkspaceDownloadCommand", () => {
  test("returns a command with download mode", () => {
    const cmd = createWorkspaceDownloadCommand("artifacts/report.pdf");
    expect(cmd).toContain('"mode":"download"');
    expect(cmd).toContain('"path":"artifacts/report.pdf"');
  });
});

describe("createWorkspaceHandoffCommand", () => {
  test("returns a command with handoff mode and no downloadName by default", () => {
    const cmd = createWorkspaceHandoffCommand("");
    expect(cmd).toContain('"mode":"handoff"');
    expect(cmd).not.toContain('"downloadName"');
  });

  test("includes downloadName when provided", () => {
    const cmd = createWorkspaceHandoffCommand("", "my-bundle.tar.gz");
    expect(cmd).toContain('"downloadName":"my-bundle.tar.gz"');
  });
});

describe("createWorkspaceArchiveCommand", () => {
  test("returns a command with archive mode", () => {
    const cmd = createWorkspaceArchiveCommand("");
    expect(cmd).toContain('"mode":"archive"');
  });

  test("includes downloadName when provided", () => {
    const cmd = createWorkspaceArchiveCommand("", "workspace.tar.gz");
    expect(cmd).toContain('"downloadName":"workspace.tar.gz"');
  });
});

describe("createWorkspaceStatusCommand", () => {
  test("returns a command with status mode and no path", () => {
    const cmd = createWorkspaceStatusCommand();
    expect(cmd).toContain('"mode":"status"');
    expect(cmd).toMatch(/2>&1$/);
  });
});
