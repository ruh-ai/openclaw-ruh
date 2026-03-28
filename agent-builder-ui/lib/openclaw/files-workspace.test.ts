import { describe, expect, test } from "bun:test";
import {
  artifactTypeLabel,
  createWorkspaceApiUrl,
  formatWorkspaceFileSize,
  groupWorkspaceFilesByArtifactType,
  isHtmlArtifact,
  isMarkdownArtifact,
  sortWorkspaceFiles,
  type WorkspaceFileItem,
} from "./files-workspace";

describe("files workspace helpers", () => {
  test("sorts newer workspace files first", () => {
    const items: WorkspaceFileItem[] = [
      {
        path: "reports/old.md",
        name: "old.md",
        type: "file",
        size: 10,
        modified_at: "2026-03-25T10:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/markdown",
        artifact_type: "document",
      },
      {
        path: "reports/new.md",
        name: "new.md",
        type: "file",
        size: 11,
        modified_at: "2026-03-25T11:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/markdown",
        artifact_type: "document",
      },
    ];

    expect(sortWorkspaceFiles(items).map((item) => item.path)).toEqual([
      "reports/new.md",
      "reports/old.md",
    ]);
  });

  test("builds encoded workspace API urls", () => {
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "file", "reports/daily.md"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/file?path=reports%2Fdaily.md");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "download", "artifacts/chart.png"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/file/download?path=artifacts%2Fchart.png");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "handoff"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/handoff");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "archive"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/archive");
  });

  test("prefers the session workspace folder for list and handoff-style routes", () => {
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "files", undefined, "conv-123"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/files?path=sessions%2Fconv-123");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "handoff", "ignored/path.txt", "conv-123"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/handoff?path=sessions%2Fconv-123");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "archive", "ignored/path.txt", "conv-123"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/archive?path=sessions%2Fconv-123");
    expect(
      createWorkspaceApiUrl("http://localhost:8000", "sb-1", "file", "reports/daily.md", "conv-123"),
    ).toBe("http://localhost:8000/api/sandboxes/sb-1/workspace/file?path=reports%2Fdaily.md");
  });

  test("formats workspace file sizes for display", () => {
    expect(formatWorkspaceFileSize(512)).toBe("512 B");
    expect(formatWorkspaceFileSize(1536)).toBe("1.5 KB");
  });

  test("groups workspace files by artifact type in display order", () => {
    const items: WorkspaceFileItem[] = [
      {
        path: "src/app.tsx",
        name: "app.tsx",
        type: "file",
        size: 120,
        modified_at: "2026-03-25T09:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/typescript",
        artifact_type: "code",
      },
      {
        path: "site/index.html",
        name: "index.html",
        type: "file",
        size: 240,
        modified_at: "2026-03-25T10:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/html",
        artifact_type: "webpage",
      },
      {
        path: "reports/daily.md",
        name: "daily.md",
        type: "file",
        size: 60,
        modified_at: "2026-03-25T08:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/markdown",
        artifact_type: "document",
      },
    ];

    expect(groupWorkspaceFilesByArtifactType(items)).toEqual([
      {
        artifactType: "webpage",
        label: "Webpage",
        items: [items[1]],
      },
      {
        artifactType: "document",
        label: "Document",
        items: [items[2]],
      },
      {
        artifactType: "code",
        label: "Code",
        items: [items[0]],
      },
    ]);
  });

  test("detects html and markdown rich-preview candidates", () => {
    const htmlFile: WorkspaceFileItem = {
      path: "site/index.html",
      name: "index.html",
      type: "file",
      size: 240,
      modified_at: "2026-03-25T10:00:00.000Z",
      preview_kind: "text",
      mime_type: "text/html",
      artifact_type: "webpage",
    };
    const markdownFile: WorkspaceFileItem = {
      path: "reports/daily.md",
      name: "daily.md",
      type: "file",
      size: 60,
      modified_at: "2026-03-25T08:00:00.000Z",
      preview_kind: "text",
      mime_type: "text/markdown",
      artifact_type: "document",
    };

    expect(artifactTypeLabel("data")).toBe("Data");
    expect(isHtmlArtifact(htmlFile)).toBe(true);
    expect(isMarkdownArtifact(htmlFile)).toBe(false);
    expect(isMarkdownArtifact(markdownFile)).toBe(true);
  });
});
