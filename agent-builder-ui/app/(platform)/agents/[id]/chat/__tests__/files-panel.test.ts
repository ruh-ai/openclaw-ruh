/**
 * files-panel.test.ts — Verify FilesPanel component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("react-markdown", () => ({
  default: ({ children }: any) => null,
}));

mock.module("rehype-highlight", () => ({
  default: () => {},
}));

mock.module("remark-gfm", () => ({
  default: () => {},
}));

mock.module("@/lib/openclaw/files-workspace", () => ({
  artifactTypeLabel: () => "",
  createWorkspaceApiUrl: () => "",
  formatWorkspaceFileSize: () => "",
  groupWorkspaceFilesByArtifactType: () => ({}),
  handoffReasonLabel: () => "",
  isHtmlArtifact: () => false,
  isMarkdownArtifact: () => false,
  sortWorkspaceFiles: (f: any[]) => f,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("FilesPanel", () => {
  test("exports FilesPanel as a default export", async () => {
    const mod = await import("../_components/FilesPanel");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
