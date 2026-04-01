"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";
import { createWorkspaceApiUrl } from "@/lib/openclaw/files-workspace";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TreeNode {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  children?: TreeNode[];
}

interface WorkspacePanelProps {
  sandboxId: string;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FILE_ICONS: Record<string, string> = {
  md: "doc",
  json: "data",
  ts: "code",
  js: "code",
  py: "code",
  sh: "code",
  yaml: "config",
  yml: "config",
  toml: "config",
};

function fileCategory(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "file";
}

// ─── TreeItem ───────────────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onFileClick,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  selectedPath: string | null;
}) {
  const isDir = node.type === "directory";
  const isOpen = expanded.has(node.path);
  const isSelected = node.path === selectedPath;
  const category = fileCategory(node.name);

  // Highlight special files
  const isSpecial = node.name === "SOUL.md" || node.name === "SKILL.md";

  return (
    <>
      <button
        onClick={() => (isDir ? onToggle(node.path) : onFileClick(node.path))}
        className={[
          "w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded-md transition-colors",
          isSelected
            ? "bg-[var(--primary)]/10 text-[var(--primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--color-light,#f5f5f5)] hover:text-[var(--text-primary)]",
          isSpecial && !isSelected ? "font-satoshi-bold" : "font-satoshi-regular",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          )
        ) : category === "code" ? (
          <FileText className="h-3 w-3 shrink-0 text-[var(--secondary)]" />
        ) : category === "doc" ? (
          <FileText className="h-3 w-3 shrink-0 text-[var(--primary)]" />
        ) : (
          <FileText className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span className="truncate">{node.name}</span>
        {isSpecial && (
          <span className="ml-auto text-[9px] text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded-full shrink-0">
            soul
          </span>
        )}
      </button>
      {isDir && isOpen && node.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
        />
      ))}
    </>
  );
}

// ─── FilePreview ────────────────────────────────────────────────────────────

function FilePreview({
  path,
  sandboxId,
  onClose,
}: {
  path: string;
  sandboxId: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = createWorkspaceApiUrl(API_BASE, sandboxId, "file", path);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setContent(data?.content ?? null))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, [path, sandboxId]);

  const fileName = path.split("/").pop() ?? path;

  return (
    <div className="flex flex-col border-t border-[var(--border-stroke)] bg-[var(--card-color)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-stroke)]">
        <span className="text-[10px] font-satoshi-bold text-[var(--text-secondary)] truncate">
          {fileName}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-[var(--color-light)] transition-colors"
        >
          <X className="h-3 w-3 text-[var(--text-tertiary)]" />
        </button>
      </div>
      <div className="overflow-auto max-h-[240px] p-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 text-[var(--primary)] animate-spin" />
          </div>
        ) : content ? (
          <pre className="text-[11px] font-mono leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
            {content}
          </pre>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)] italic">
            Unable to read file
          </p>
        )}
      </div>
    </div>
  );
}

// ─── WorkspacePanel ─────────────────────────────────────────────────────────

export function WorkspacePanel({ sandboxId, onClose }: WorkspacePanelProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch workspace tree
  useEffect(() => {
    setLoading(true);
    const url = createWorkspaceApiUrl(API_BASE, sandboxId, "files");
    const fullUrl = new URL(url);
    fullUrl.searchParams.set("depth", "3");
    fullUrl.searchParams.set("limit", "200");

    fetch(fullUrl.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.items) {
          setTree([]);
          return;
        }
        // Build tree from flat file list
        const items: Array<{ path: string; name: string; type: string; size?: number }> = data.items;
        const root: TreeNode[] = [];

        function ensureDir(children: TreeNode[], dirName: string, dirPath: string): TreeNode {
          let existing = children.find((c) => c.type === "directory" && c.name === dirName);
          if (!existing) {
            existing = { path: dirPath, name: dirName, type: "directory", children: [] };
            children.push(existing);
          }
          return existing;
        }

        for (const item of items) {
          const parts = item.path.split("/");
          const fileName = parts.pop()!;
          let current = root;
          for (let i = 0; i < parts.length; i++) {
            const dirPath = parts.slice(0, i + 1).join("/");
            const dir = ensureDir(current, parts[i], dirPath);
            current = dir.children!;
          }
          current.push({
            path: item.path,
            name: fileName,
            type: item.type === "directory" ? "directory" : "file",
            size: item.size,
          });
        }

        // Sort: directories first, then alphabetical
        function sortNodes(nodes: TreeNode[]) {
          nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          for (const n of nodes) {
            if (n.children) sortNodes(n.children);
          }
        }
        sortNodes(root);
        setTree(root);

        // Auto-expand top-level directories
        const topDirs = root.filter((n) => n.type === "directory").map((n) => n.path);
        setExpanded(new Set(topDirs));
      })
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [sandboxId, refreshKey]);

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col h-full w-[280px] border-l border-[var(--border-stroke)] bg-[var(--sidebar-bg,#fdfbff)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-stroke)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="text-xs font-satoshi-bold text-[var(--text-primary)]">
            Workspace
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1 rounded-md hover:bg-[var(--color-light)] transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 text-[var(--text-tertiary)] ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--color-light)] transition-colors"
            title="Close panel"
          >
            <X className="h-3 w-3 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />
            <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
              Loading workspace...
            </span>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 px-4">
            <FolderOpen className="h-6 w-6 text-[var(--text-tertiary)]/30" />
            <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] text-center">
              Workspace is empty. The Architect will create files as you describe your agent.
            </span>
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              onFileClick={setSelectedFile}
              selectedPath={selectedFile}
            />
          ))
        )}
      </div>

      {/* File preview */}
      {selectedFile && (
        <FilePreview
          path={selectedFile}
          sandboxId={sandboxId}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}
