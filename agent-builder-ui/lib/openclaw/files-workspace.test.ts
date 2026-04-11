import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  artifactTypeLabel,
  createWorkspaceApiUrl,
  formatWorkspaceFileSize,
  groupWorkspaceFilesByArtifactType,
  isHtmlArtifact,
  isMarkdownArtifact,
  sessionWorkspaceFolder,
  handoffReasonLabel,
  fetchWorkspaceStatus,
  sortWorkspaceFiles,
  type WorkspaceFileItem,
} from "./files-workspace";

const mockFetch = mock(async () =>
  new Response(JSON.stringify({ soul_exists: true, skill_count: 2, skill_ids: ["s1", "s2"] }), { status: 200 }),
);
globalThis.fetch = mockFetch as unknown as typeof fetch;

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

describe("fetchWorkspaceStatus", () => {
  beforeEach(() => mockFetch.mockClear());

  test("returns workspace status from API", async () => {
    const status = await fetchWorkspaceStatus("http://localhost:8000", "sandbox-1");
    expect(status.soul_exists).toBe(true);
    expect(status.skill_count).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sandboxes/sandbox-1/workspace/status",
    );
  });

  test("throws when API returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(fetchWorkspaceStatus("http://localhost:8000", "bad-sandbox")).rejects.toThrow("Workspace status failed: 404");
  });
});

describe("sessionWorkspaceFolder", () => {
  test("returns sessions/<sessionId> path", () => {
    expect(sessionWorkspaceFolder("session-abc")).toBe("sessions/session-abc");
  });
});

describe("formatWorkspaceFileSize", () => {
  test("formats bytes under 1KB", () => {
    expect(formatWorkspaceFileSize(512)).toBe("512 B");
    expect(formatWorkspaceFileSize(0)).toBe("0 B");
  });

  test("formats bytes in KB range", () => {
    expect(formatWorkspaceFileSize(1024)).toBe("1.0 KB");
    expect(formatWorkspaceFileSize(2048)).toBe("2.0 KB");
    expect(formatWorkspaceFileSize(1536)).toBe("1.5 KB");
  });

  test("formats bytes in MB range", () => {
    expect(formatWorkspaceFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatWorkspaceFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("handoffReasonLabel", () => {
  test("returns label for workspace_empty", () => {
    expect(handoffReasonLabel("workspace_empty")).toContain("No files");
  });

  test("returns label for too_many_files", () => {
    expect(handoffReasonLabel("too_many_files")).toContain("too many files");
  });

  test("returns label for archive_too_large", () => {
    expect(handoffReasonLabel("archive_too_large")).toContain("too large");
  });

  test("returns default label for unknown reason", () => {
    expect(handoffReasonLabel(null)).toContain("unknown");
    expect(handoffReasonLabel("other_reason")).toContain("unknown");
  });
});

describe("createWorkspaceApiUrl", () => {
  test("generates files URL", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "files");
    expect(url).toBe("http://localhost:8000/api/sandboxes/sandbox-1/workspace/files");
  });

  test("generates file URL with path param", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "file", "skills/SKILL.md");
    expect(url).toContain("workspace/file");
    expect(url).toContain("path=skills%2FSKILL.md");
  });

  test("generates download URL", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "download");
    expect(url).toContain("workspace/file/download");
  });

  test("uses session path for files route when sessionId provided", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "files", undefined, "session-abc");
    expect(url).toContain("sessions%2Fsession-abc");
  });

  test("uses session path for handoff route", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "handoff", undefined, "session-abc");
    expect(url).toContain("workspace/handoff");
    expect(url).toContain("sessions%2Fsession-abc");
  });

  test("uses session path for archive route", () => {
    const url = createWorkspaceApiUrl("http://localhost:8000", "sandbox-1", "archive", undefined, "session-abc");
    expect(url).toContain("workspace/archive");
  });
});

describe("isHtmlArtifact edge cases", () => {
  test("detects .htm extension", () => {
    expect(isHtmlArtifact({ artifact_type: "other", mime_type: "text/plain", path: "page.htm" })).toBe(true);
  });

  test("detects .html extension", () => {
    expect(isHtmlArtifact({ artifact_type: "other", mime_type: "text/plain", path: "page.html" })).toBe(true);
  });

  test("returns false for non-html file", () => {
    expect(isHtmlArtifact({ artifact_type: "code", mime_type: "text/typescript", path: "app.ts" })).toBe(false);
  });
});

describe("artifactTypeLabel all values", () => {
  test("returns all known artifact type labels", () => {
    expect(artifactTypeLabel("webpage")).toBe("Webpage");
    expect(artifactTypeLabel("document")).toBe("Document");
    expect(artifactTypeLabel("data")).toBe("Data");
    expect(artifactTypeLabel("code")).toBe("Code");
    expect(artifactTypeLabel("image")).toBe("Image");
    expect(artifactTypeLabel("archive")).toBe("Archive");
    expect(artifactTypeLabel("other")).toBe("Other");
  });
});
