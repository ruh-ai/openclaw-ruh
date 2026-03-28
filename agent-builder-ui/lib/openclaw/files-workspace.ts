export type WorkspacePreviewKind = "text" | "image" | "pdf" | "binary";
export type WorkspaceArtifactType = "webpage" | "document" | "data" | "code" | "image" | "archive" | "other";

export interface WorkspaceFileItem {
  path: string;
  name: string;
  type: "file";
  size: number;
  modified_at: string;
  preview_kind: WorkspacePreviewKind;
  mime_type: string;
  artifact_type: WorkspaceArtifactType;
  output_label?: string | null;
  source_conversation_id?: string | null;
  source_conversation_turn?: string | null;
  source_description?: string | null;
}

export interface WorkspaceFilePayload extends WorkspaceFileItem {
  content?: string;
  truncated?: boolean;
  download_name?: string;
}

export interface WorkspaceArchiveSummary {
  eligible: boolean;
  reason: string | null;
  file_count: number;
  total_bytes: number;
  download_name: string;
}

export interface WorkspaceHandoffPayload {
  summary: string;
  file_count: number;
  code_file_count: number;
  total_bytes: number;
  top_level_paths: string[];
  suggested_paths: string[];
  archive: WorkspaceArchiveSummary;
}

export interface WorkspaceArtifactGroup {
  artifactType: WorkspaceArtifactType;
  label: string;
  items: WorkspaceFileItem[];
}

export function sortWorkspaceFiles(items: WorkspaceFileItem[]): WorkspaceFileItem[] {
  return [...items].sort((left, right) => {
    const byDate = right.modified_at.localeCompare(left.modified_at);
    if (byDate !== 0) return byDate;
    return left.path.localeCompare(right.path);
  });
}

export function artifactTypeLabel(artifactType: WorkspaceArtifactType): string {
  switch (artifactType) {
    case "webpage":
      return "Webpage";
    case "document":
      return "Document";
    case "data":
      return "Data";
    case "code":
      return "Code";
    case "image":
      return "Image";
    case "archive":
      return "Archive";
    default:
      return "Other";
  }
}

const ARTIFACT_TYPE_ORDER: WorkspaceArtifactType[] = [
  "webpage",
  "document",
  "image",
  "code",
  "data",
  "archive",
  "other",
];

export function groupWorkspaceFilesByArtifactType(items: WorkspaceFileItem[]): WorkspaceArtifactGroup[] {
  const groups = new Map<WorkspaceArtifactType, WorkspaceFileItem[]>();
  for (const item of sortWorkspaceFiles(items)) {
    const groupItems = groups.get(item.artifact_type) ?? [];
    groupItems.push(item);
    groups.set(item.artifact_type, groupItems);
  }

  return ARTIFACT_TYPE_ORDER
    .map((artifactType) => {
      const groupItems = groups.get(artifactType) ?? [];
      if (groupItems.length === 0) return null;
      return {
        artifactType,
        label: artifactTypeLabel(artifactType),
        items: groupItems,
      };
    })
    .filter((group): group is WorkspaceArtifactGroup => group !== null);
}

export function isHtmlArtifact(file: Pick<WorkspaceFileItem, "artifact_type" | "mime_type" | "path">): boolean {
  return file.artifact_type === "webpage"
    || file.mime_type === "text/html"
    || file.path.toLowerCase().endsWith(".html")
    || file.path.toLowerCase().endsWith(".htm");
}

export function isMarkdownArtifact(file: Pick<WorkspaceFileItem, "mime_type" | "path">): boolean {
  const lowerPath = file.path.toLowerCase();
  return file.mime_type === "text/markdown" || lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown");
}

export function createWorkspaceApiUrl(
  apiBase: string,
  sandboxId: string,
  route: "files" | "file" | "download" | "handoff" | "archive",
  relativePath?: string,
  sessionId?: string,
): string {
  const suffix = route === "files"
    ? "files"
    : route === "file"
      ? "file"
      : route === "download"
        ? "file/download"
        : route;
  const url = new URL(`/api/sandboxes/${sandboxId}/workspace/${suffix}`, apiBase);
  const effectivePath = sessionId && (route === "files" || route === "handoff" || route === "archive")
    ? `sessions/${sessionId}`
    : relativePath;
  if (effectivePath) {
    url.searchParams.set("path", effectivePath);
  }
  return url.toString();
}

export function sessionWorkspaceFolder(sessionId: string): string {
  return `sessions/${sessionId}`;
}

export function formatWorkspaceFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function handoffReasonLabel(reason: string | null): string {
  switch (reason) {
    case "workspace_empty":
      return "No files are available to export yet.";
    case "too_many_files":
      return "The workspace has too many files for a bounded archive export.";
    case "archive_too_large":
      return "The workspace is too large for a bounded archive export.";
    default:
      return "Workspace archive availability is unknown.";
  }
}
