import { describe, expect, test } from "bun:test";
import {
  createWorkspaceApiUrl,
  formatWorkspaceFileSize,
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
      },
      {
        path: "reports/new.md",
        name: "new.md",
        type: "file",
        size: 11,
        modified_at: "2026-03-25T11:00:00.000Z",
        preview_kind: "text",
        mime_type: "text/markdown",
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
  });

  test("formats workspace file sizes for display", () => {
    expect(formatWorkspaceFileSize(512)).toBe("512 B");
    expect(formatWorkspaceFileSize(1536)).toBe("1.5 KB");
  });
});
