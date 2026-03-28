"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Database,
  Download,
  FileArchive,
  FileCode2,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  ListTree,
  Loader2,
  RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  artifactTypeLabel,
  createWorkspaceApiUrl,
  formatWorkspaceFileSize,
  groupWorkspaceFilesByArtifactType,
  handoffReasonLabel,
  isHtmlArtifact,
  isMarkdownArtifact,
  sortWorkspaceFiles,
  type WorkspaceArtifactType,
  type WorkspaceFileItem,
  type WorkspaceFilePayload,
  type WorkspaceHandoffPayload,
} from "@/lib/openclaw/files-workspace";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FilesPanelProps {
  sandboxId: string | null;
  conversationId: string | null;
  /** Increments when workspace files change; triggers re-fetch */
  refreshTick?: number;
  /** Whether the agent is currently running (enables polling) */
  isAgentRunning?: boolean;
}

function previewKindLabel(file: WorkspaceFileItem | WorkspaceFilePayload): string {
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

function artifactIcon(artifactType: WorkspaceArtifactType) {
  switch (artifactType) {
    case "webpage":
      return <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-200/70" />;
    case "data":
      return <Database className="h-3.5 w-3.5 shrink-0 text-amber-200/70" />;
    case "image":
      return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-blue-200/70" />;
    case "archive":
      return <FileArchive className="h-3.5 w-3.5 shrink-0 text-amber-200/70" />;
    case "code":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-emerald-200/70" />;
    default:
      return <FileText className="h-3.5 w-3.5 shrink-0 text-white/55" />;
  }
}

function artifactBadgeClassName(artifactType: WorkspaceArtifactType): string {
  switch (artifactType) {
    case "webpage":
      return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
    case "document":
      return "border-violet-300/20 bg-violet-400/10 text-violet-100";
    case "data":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "code":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "image":
      return "border-blue-300/25 bg-blue-400/10 text-blue-100";
    case "archive":
      return "border-orange-300/25 bg-orange-400/10 text-orange-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function renderSourceMetadata(file: WorkspaceFilePayload | WorkspaceFileItem): string[] {
  const metadata: string[] = [];
  if (file.output_label) {
    metadata.push(file.output_label);
  }
  if (file.source_conversation_turn) {
    metadata.push(`Turn ${file.source_conversation_turn}`);
  } else if (file.source_conversation_id) {
    metadata.push(`Session ${file.source_conversation_id.slice(0, 8)}…`);
  }
  return metadata;
}

export default function FilesPanel({ sandboxId, conversationId, refreshTick = 0, isAgentRunning = false }: FilesPanelProps) {
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFilePayload | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<WorkspaceHandoffPayload | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [browseMode, setBrowseMode] = useState<"files" | "gallery">("files");
  const [textPreviewMode, setTextPreviewMode] = useState<"rendered" | "source">("rendered");
  const [manualRefreshTick, setManualRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = useCallback(() => {
    setManualRefreshTick(prev => prev + 1);
  }, []);

  useEffect(() => {
    setSelectedPath(null);
    setSelectedFile(null);
    setCopyState("idle");
    setBrowseMode("files");
    setTextPreviewMode("rendered");
  }, [conversationId]);

  // Combine all refresh triggers
  const combinedRefreshTick = refreshTick + manualRefreshTick;

  useEffect(() => {
    if (!sandboxId || !conversationId) {
      setFiles([]);
      setListError(null);
      setHandoff(null);
      setHandoffError(null);
      return;
    }

    let cancelled = false;
    const isInitialLoad = files.length === 0;
    if (isInitialLoad) setLoadingList(true);
    else setIsRefreshing(true);
    setListError(null);
    setHandoffError(null);

    Promise.allSettled([
      fetch(createWorkspaceApiUrl(API_BASE, sandboxId, "files", undefined, conversationId ?? undefined))
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load workspace files");
          return response.json() as Promise<{ items?: WorkspaceFileItem[] }>;
        }),
      fetch(createWorkspaceApiUrl(API_BASE, sandboxId, "handoff", undefined, conversationId ?? undefined))
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load workspace handoff");
          return response.json() as Promise<WorkspaceHandoffPayload>;
        }),
    ])
      .then(([filesResult, handoffResult]) => {
        if (cancelled) return;
        if (filesResult.status === "rejected") {
          throw filesResult.reason;
        }
        const nextFiles = sortWorkspaceFiles(filesResult.value.items ?? []);
        setFiles(nextFiles);
        setSelectedPath((current) => current ?? nextFiles[0]?.path ?? null);
        if (handoffResult.status === "fulfilled") {
          setHandoff(handoffResult.value);
        } else {
          const message = handoffResult.reason instanceof Error
            ? handoffResult.reason.message
            : "Unable to load workspace handoff";
          setHandoff(null);
          setHandoffError(message);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load workspace files";
        setListError(message);
        setFiles([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingList(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId, conversationId, combinedRefreshTick]);

  // Poll while agent is running
  useEffect(() => {
    if (!isAgentRunning || !sandboxId || !conversationId) return;
    const interval = setInterval(() => {
      setManualRefreshTick(prev => prev + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [isAgentRunning, sandboxId, conversationId]);

  useEffect(() => {
    if (!sandboxId || !selectedPath) {
      setSelectedFile(null);
      return;
    }

    let cancelled = false;
    setLoadingFile(true);
    setTextPreviewMode("rendered");

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

  const selectedListItem = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? null,
    [files, selectedPath],
  );

  const selectedDownloadUrl = useMemo(() => {
    if (!sandboxId || !selectedPath) return null;
    return createWorkspaceApiUrl(API_BASE, sandboxId, "download", selectedPath);
  }, [sandboxId, selectedPath]);

  const archiveUrl = useMemo(() => {
    if (!sandboxId || !conversationId || !handoff?.archive.eligible) return null;
    return createWorkspaceApiUrl(API_BASE, sandboxId, "archive", undefined, conversationId);
  }, [conversationId, handoff?.archive.eligible, sandboxId]);

  const artifactGroups = useMemo(() => groupWorkspaceFilesByArtifactType(files), [files]);
  const imageFiles = useMemo(() => files.filter((file) => file.preview_kind === "image"), [files]);

  const handleCopySelectedFile = async () => {
    if (selectedFile?.preview_kind !== "text" || !selectedFile.content) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  const buildDownloadUrl = (relativePath: string) => {
    if (!sandboxId) return null;
    return createWorkspaceApiUrl(API_BASE, sandboxId, "download", relativePath);
  };

  const richPreviewState = selectedFile && selectedFile.preview_kind === "text"
    ? {
        html: isHtmlArtifact(selectedFile),
        markdown: isMarkdownArtifact(selectedFile),
      }
    : {
        html: false,
        markdown: false,
      };
  const selectionMetadata = selectedFile ? renderSourceMetadata(selectedFile) : [];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/5 px-4 py-2.5">
        <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">
          Session Files
        </p>
        <p className="text-[10px] font-mono text-white/25">
          {conversationId
            ? `${files.length} file${files.length === 1 ? "" : "s"} · sessions/${conversationId.slice(0, 8)}…`
            : "No active session"}
        </p>
      </div>

      <div className="shrink-0 border-b border-white/5 px-4 py-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/45">
                Code handoff
              </p>
              <p className="mt-1 text-[12px] font-satoshi-bold text-white/85">
                {handoff?.summary ?? (handoffError ?? "Loading workspace handoff…")}
              </p>
            </div>
            {archiveUrl && (
              <a
                href={archiveUrl}
                download={handoff?.archive.download_name}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-satoshi-bold text-white/80 transition-colors hover:bg-white/10"
              >
                <FileArchive className="h-3 w-3" />
                Export workspace bundle
              </a>
            )}
          </div>

          {handoff && (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono text-white/30">
                <span>{handoff.file_count} files</span>
                <span>{handoff.code_file_count} code files</span>
                <span>{formatWorkspaceFileSize(handoff.total_bytes)}</span>
              </div>
              {handoff.top_level_paths.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {handoff.top_level_paths.map((path) => (
                    <span
                      key={path}
                      className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] font-mono text-white/45"
                    >
                      {path}
                    </span>
                  ))}
                </div>
              )}
              {handoff.suggested_paths.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/35">
                    Suggested starting points
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {handoff.suggested_paths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setSelectedPath(path)}
                        className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] font-mono text-white/60 transition-colors hover:border-white/15 hover:text-white/85"
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!handoff.archive.eligible && (
                <p className="mt-3 text-[10px] font-mono text-amber-200/75">
                  {handoffReasonLabel(handoff.archive.reason)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r border-white/5">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">
                Browse Outputs
              </p>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Refresh files"
                className="p-0.5 rounded text-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="inline-flex rounded-lg border border-white/8 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setBrowseMode("files")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-satoshi-bold transition-colors ${
                  browseMode === "files" ? "bg-white/10 text-white/85" : "text-white/45 hover:text-white/70"
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                Files
              </button>
              <button
                type="button"
                onClick={() => setBrowseMode("gallery")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-satoshi-bold transition-colors ${
                  browseMode === "gallery" ? "bg-white/10 text-white/85" : "text-white/45 hover:text-white/70"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Gallery
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white/20" />
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
            ) : browseMode === "files" ? (
              <div className="p-2 space-y-1.5">
                {files.map((file) => {
                  const sourceMetadata = renderSourceMetadata(file);
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedPath(file.path)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selectedPath === file.path
                          ? "border-white/15 bg-white/10"
                          : "border-white/5 bg-zinc-900/70 hover:border-white/10 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {artifactIcon(file.artifact_type)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[11px] font-mono text-white/80">{file.name}</p>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-satoshi-bold uppercase tracking-wide ${artifactBadgeClassName(file.artifact_type)}`}
                            >
                              {artifactTypeLabel(file.artifact_type)}
                            </span>
                          </div>
                          <p className="truncate text-[10px] font-mono text-white/25">{file.path}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] font-mono text-white/25">
                            <span>{previewKindLabel(file)}</span>
                            <span>{formatWorkspaceFileSize(file.size)}</span>
                            {sourceMetadata.map((entry) => (
                              <span key={entry}>{entry}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 p-3">
                {artifactGroups.map((group) => (
                  <section key={group.artifactType}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      {artifactIcon(group.artifactType)}
                      <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/45">
                        {group.label}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {group.items.map((file) => {
                        const thumbnailUrl = file.preview_kind === "image" ? buildDownloadUrl(file.path) : null;
                        return (
                          <button
                            key={file.path}
                            type="button"
                            onClick={() => setSelectedPath(file.path)}
                            className={`overflow-hidden rounded-xl border text-left transition-colors ${
                              selectedPath === file.path
                                ? "border-white/15 bg-white/10"
                                : "border-white/6 bg-zinc-900/70 hover:border-white/12 hover:bg-white/5"
                            }`}
                          >
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt={file.name}
                                className="h-28 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-20 items-center justify-center bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent">
                                {artifactIcon(file.artifact_type)}
                              </div>
                            )}
                            <div className="space-y-1 p-3">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-[11px] font-satoshi-bold text-white/85">{file.output_label ?? file.name}</p>
                                <span
                                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-satoshi-bold uppercase tracking-wide ${artifactBadgeClassName(file.artifact_type)}`}
                                >
                                  {artifactTypeLabel(file.artifact_type)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-[10px] font-mono text-white/30">
                                {file.source_description ?? file.path}
                              </p>
                              <div className="flex items-center gap-2 text-[9px] font-mono text-white/25">
                                <span>{formatWorkspaceFileSize(file.size)}</span>
                                {file.source_conversation_turn && <span>Turn {file.source_conversation_turn}</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {!selectedPath ? (
            <div className="flex h-full flex-col items-center justify-center">
              <FileText className="mb-3 h-7 w-7 text-white/8" />
              <p className="text-[10px] font-mono text-white/15">Select a file to inspect</p>
            </div>
          ) : loadingFile ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-satoshi-bold text-white/85">
                      {selectedFile.output_label ?? selectedFile.name}
                    </p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-satoshi-bold uppercase tracking-wide ${artifactBadgeClassName(selectedFile.artifact_type)}`}
                    >
                      {artifactTypeLabel(selectedFile.artifact_type)}
                    </span>
                  </div>
                  <p className="truncate text-[10px] font-mono text-white/25">{selectedFile.path}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFile.preview_kind === "text" && (
                    <button
                      type="button"
                      onClick={handleCopySelectedFile}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-satoshi-bold text-white/80 transition-colors hover:bg-white/10"
                    >
                      {copyState === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy file contents"}
                    </button>
                  )}
                  {selectedDownloadUrl && (
                    <a
                      href={selectedDownloadUrl}
                      download={selectedFile.download_name ?? selectedFile.name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-satoshi-bold text-white/80 transition-colors hover:bg-white/10"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/25">
                <span>{previewKindLabel(selectedFile)}</span>
                <span>{formatWorkspaceFileSize(selectedFile.size)}</span>
                <span>{selectedFile.mime_type}</span>
                {selectionMetadata.map((entry) => (
                  <span key={entry}>{entry}</span>
                ))}
              </div>

              {(selectedFile.source_description || selectionMetadata.length > 0) && (
                <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3.5 py-3">
                  <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">
                    Output Metadata
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono text-white/35">
                    {selectionMetadata.map((entry) => (
                      <span key={entry}>{entry}</span>
                    ))}
                  </div>
                  {selectedFile.source_description && (
                    <p className="mt-2 text-[11px] text-white/60">{selectedFile.source_description}</p>
                  )}
                </div>
              )}

              {selectedFile.preview_kind === "text" && (
                <div className="space-y-3">
                  {selectedFile.truncated && (
                    <p className="text-[10px] font-mono text-amber-200/70">
                      Preview truncated to the safe text limit. Download the file for the full contents.
                    </p>
                  )}

                  {richPreviewState.html && (
                    <div className="inline-flex rounded-lg border border-white/8 bg-white/[0.03] p-1">
                      <button
                        type="button"
                        onClick={() => setTextPreviewMode("rendered")}
                        className={`rounded-md px-2 py-1 text-[10px] font-satoshi-bold transition-colors ${
                          textPreviewMode === "rendered" ? "bg-white/10 text-white/85" : "text-white/45 hover:text-white/70"
                        }`}
                      >
                        Rendered
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextPreviewMode("source")}
                        className={`rounded-md px-2 py-1 text-[10px] font-satoshi-bold transition-colors ${
                          textPreviewMode === "source" ? "bg-white/10 text-white/85" : "text-white/45 hover:text-white/70"
                        }`}
                      >
                        Source
                      </button>
                    </div>
                  )}

                  {richPreviewState.html && textPreviewMode === "rendered" ? (
                    <div className="overflow-hidden rounded-xl border border-white/5 bg-white">
                      <iframe
                        title={selectedFile.name}
                        sandbox=""
                        srcDoc={selectedFile.content ?? ""}
                        className="h-[560px] w-full bg-white"
                      />
                    </div>
                  ) : richPreviewState.markdown ? (
                    <div className="overflow-hidden rounded-xl border border-white/5 bg-zinc-900/80 p-5">
                      <article className="prose prose-invert max-w-none prose-pre:bg-black/40 prose-code:text-cyan-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {selectedFile.content ?? ""}
                        </ReactMarkdown>
                      </article>
                    </div>
                  ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-zinc-900/80 p-4 text-[11px] font-mono text-white/75">
                      {selectedFile.content ?? ""}
                    </pre>
                  )}
                </div>
              )}

              {selectedFile.preview_kind === "image" && selectedDownloadUrl && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">Image Preview</p>
                    <img
                      src={selectedDownloadUrl}
                      alt={selectedFile.name}
                      className="mt-2 max-h-[420px] w-full rounded-xl border border-white/5 bg-zinc-900/80 object-contain"
                    />
                  </div>

                  {imageFiles.length > 1 && (
                    <div>
                      <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">
                        Image Gallery
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
                        {imageFiles.map((file) => {
                          const imageUrl = buildDownloadUrl(file.path);
                          if (!imageUrl) return null;
                          return (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => setSelectedPath(file.path)}
                              className={`overflow-hidden rounded-xl border text-left transition-colors ${
                                selectedPath === file.path
                                  ? "border-white/15 bg-white/10"
                                  : "border-white/6 bg-zinc-900/70 hover:border-white/12 hover:bg-white/5"
                              }`}
                            >
                              <img src={imageUrl} alt={file.name} className="h-28 w-full object-cover" />
                              <div className="p-2">
                                <p className="truncate text-[10px] font-satoshi-bold text-white/80">{file.name}</p>
                                <p className="truncate text-[9px] font-mono text-white/25">{file.path}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(selectedFile.preview_kind === "pdf" || selectedFile.preview_kind === "binary") && (
                <div className="rounded-xl border border-white/5 bg-zinc-900/80 p-4">
                  <p className="text-[11px] font-mono text-white/60">
                    Inline preview is not available for this {selectedFile.preview_kind === "pdf" ? "PDF" : "binary file"} in the current slice.
                  </p>
                  <p className="mt-2 text-[10px] font-mono text-white/25">
                    Use Download to inspect or hand off the generated artifact.
                  </p>
                </div>
              )}

              {selectedListItem && browseMode === "gallery" && (
                <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3.5 py-3">
                  <p className="text-[10px] font-satoshi-bold uppercase tracking-widest text-white/40">
                    Gallery Context
                  </p>
                  <p className="mt-2 text-[11px] text-white/60">
                    Browsing by deliverable keeps artifact types grouped while preserving the same selected-file preview state.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center">
              <FileText className="mb-3 h-7 w-7 text-white/8" />
              <p className="text-[10px] font-mono text-white/15">Unable to preview the selected file</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
