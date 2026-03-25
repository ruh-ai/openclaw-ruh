"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileArchive,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import {
  createWorkspaceApiUrl,
  formatWorkspaceFileSize,
  sortWorkspaceFiles,
  type WorkspaceFileItem,
  type WorkspaceFilePayload,
} from "@/lib/openclaw/files-workspace";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FilesPanelProps {
  sandboxId: string | null;
  conversationId: string | null;
}

function kindLabel(file: WorkspaceFileItem | WorkspaceFilePayload): string {
  switch (file.preview_kind) {
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "binary":
      return "Binary";
    default:
      return "Text";
  }
}

function kindIcon(previewKind: WorkspaceFileItem["preview_kind"]) {
  switch (previewKind) {
    case "image":
      return <ImageIcon className="h-3.5 w-3.5 text-blue-300/60 shrink-0" />;
    case "pdf":
    case "binary":
      return <FileArchive className="h-3.5 w-3.5 text-amber-300/60 shrink-0" />;
    default:
      return <FileCode2 className="h-3.5 w-3.5 text-emerald-300/60 shrink-0" />;
  }
}

export default function FilesPanel({ sandboxId, conversationId }: FilesPanelProps) {
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFilePayload | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath(null);
    setSelectedFile(null);
  }, [conversationId]);

  useEffect(() => {
    if (!sandboxId || !conversationId) {
      setFiles([]);
      setListError(null);
      return;
    }

    let cancelled = false;
    setLoadingList(true);
    setListError(null);

    fetch(createWorkspaceApiUrl(API_BASE, sandboxId, "files", undefined, conversationId ?? undefined))
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load workspace files");
        return response.json() as Promise<{ items?: WorkspaceFileItem[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const nextFiles = sortWorkspaceFiles(payload.items ?? []);
        setFiles(nextFiles);
        setSelectedPath((current) => current ?? nextFiles[0]?.path ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(error instanceof Error ? error.message : "Unable to load workspace files");
        setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sandboxId, conversationId]);

  useEffect(() => {
    if (!sandboxId || !selectedPath) {
      setSelectedFile(null);
      return;
    }

    let cancelled = false;
    setLoadingFile(true);

    fetch(createWorkspaceApiUrl(API_BASE, sandboxId, "file", selectedPath))
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load selected file");
        return response.json() as Promise<WorkspaceFilePayload>;
      })
      .then((payload) => {
        if (!cancelled) setSelectedFile(payload);
      })
      .catch(() => {
        if (!cancelled) setSelectedFile(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sandboxId, selectedPath]);

  const downloadUrl = useMemo(() => {
    if (!sandboxId || !selectedPath) return null;
    return createWorkspaceApiUrl(API_BASE, sandboxId, "download", selectedPath);
  }, [sandboxId, selectedPath]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-2.5 border-b border-white/5">
        <p className="text-[10px] font-satoshi-bold text-white/40 uppercase tracking-widest">
          Session Files
        </p>
        <p className="text-[10px] font-mono text-white/25">
          {conversationId
            ? `${files.length} file${files.length === 1 ? "" : "s"} · sessions/${conversationId.slice(0, 8)}…`
            : "No active session"}
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-72 shrink-0 border-r border-white/5 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 text-white/20 animate-spin" />
            </div>
          ) : listError ? (
            <div className="p-4">
              <p className="text-[11px] font-mono text-red-200/70">{listError}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="p-4">
              <p className="text-[11px] font-mono text-white/25">
                No files yet in this session. Files the agent writes to the session folder will appear here.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selectedPath === file.path
                      ? "border-white/15 bg-white/10"
                      : "border-white/5 bg-zinc-900/70 hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {kindIcon(file.preview_kind)}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono text-white/80 truncate">{file.name}</p>
                      <p className="text-[10px] font-mono text-white/25 truncate">{file.path}</p>
                      <div className="mt-1 flex items-center gap-2 text-[9px] font-mono text-white/20">
                        <span>{kindLabel(file)}</span>
                        <span>{formatWorkspaceFileSize(file.size)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {!selectedPath ? (
            <div className="flex flex-col items-center justify-center h-full">
              <FileText className="h-7 w-7 text-white/8 mb-3" />
              <p className="text-[10px] font-mono text-white/15">Select a file to inspect</p>
            </div>
          ) : loadingFile ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 text-white/20 animate-spin" />
            </div>
          ) : selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-satoshi-bold text-white/85 truncate">{selectedFile.name}</p>
                  <p className="text-[10px] font-mono text-white/25 truncate">{selectedFile.path}</p>
                </div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={selectedFile.download_name ?? selectedFile.name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-satoshi-bold text-white/80 transition-colors hover:bg-white/10"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/25">
                <span>{kindLabel(selectedFile)}</span>
                <span>{formatWorkspaceFileSize(selectedFile.size)}</span>
                <span>{selectedFile.mime_type}</span>
              </div>

              {selectedFile.preview_kind === "text" && (
                <div className="space-y-2">
                  {selectedFile.truncated && (
                    <p className="text-[10px] font-mono text-amber-200/70">
                      Preview truncated to the safe text limit. Download the file for the full contents.
                    </p>
                  )}
                  <pre className="overflow-x-auto rounded-xl border border-white/5 bg-zinc-900/80 p-4 text-[11px] font-mono text-white/75 whitespace-pre-wrap">
                    {selectedFile.content ?? ""}
                  </pre>
                </div>
              )}

              {selectedFile.preview_kind === "image" && downloadUrl && (
                <div className="space-y-2">
                  <p className="text-[10px] font-satoshi-bold text-white/40 uppercase tracking-widest">Image Preview</p>
                  <img
                    src={downloadUrl}
                    alt={selectedFile.name}
                    className="max-h-[420px] w-full object-contain rounded-xl border border-white/5 bg-zinc-900/80"
                  />
                </div>
              )}

              {(selectedFile.preview_kind === "pdf" || selectedFile.preview_kind === "binary") && (
                <div className="rounded-xl border border-white/5 bg-zinc-900/80 p-4">
                  <p className="text-[11px] font-mono text-white/60">
                    Inline preview is not available for this {selectedFile.preview_kind === "pdf" ? "PDF" : "binary file"} in the first slice.
                  </p>
                  <p className="mt-2 text-[10px] font-mono text-white/25">
                    Use Download to inspect or hand off the generated artifact.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <FileText className="h-7 w-7 text-white/8 mb-3" />
              <p className="text-[10px] font-mono text-white/15">Unable to preview the selected file</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
