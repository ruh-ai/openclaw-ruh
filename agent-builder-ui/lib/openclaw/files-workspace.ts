export type WorkspacePreviewKind = "text" | "image" | "pdf" | "binary";

export interface WorkspaceFileItem {
  path: string;
  name: string;
  type: "file";
  size: number;
  modified_at: string;
  preview_kind: WorkspacePreviewKind;
  mime_type: string;
}

export interface WorkspaceFilePayload extends WorkspaceFileItem {
  content?: string;
  truncated?: boolean;
  download_name?: string;
}

export function sortWorkspaceFiles(items: WorkspaceFileItem[]): WorkspaceFileItem[] {
  return [...items].sort((left, right) => {
    const byDate = right.modified_at.localeCompare(left.modified_at);
    if (byDate !== 0) return byDate;
    return left.path.localeCompare(right.path);
  });
}

export function createWorkspaceApiUrl(
  apiBase: string,
  sandboxId: string,
  route: "files" | "file" | "download",
  relativePath?: string,
): string {
  const url = new URL(
    `/api/sandboxes/${sandboxId}/workspace/${route === "files" ? "files" : route === "file" ? "file" : "file/download"}`,
    apiBase,
  );
  if (relativePath) {
    url.searchParams.set("path", relativePath);
  }
  return url.toString();
}

export function formatWorkspaceFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
