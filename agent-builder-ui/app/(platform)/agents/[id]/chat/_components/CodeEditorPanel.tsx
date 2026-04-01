"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Code2,
  FileCode,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import { createWorkspaceApiUrl } from "@/lib/openclaw/files-workspace";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EditorFile {
  path: string;
  content: string;
  language: string;
}

interface FileTreeItem {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: FileTreeItem[];
}

interface CodeEditorPanelProps {
  activeFile: EditorFile | null;
  recentFiles: Array<{ path: string; language: string }>;
  onFileSelect: (path: string) => void;
  sandboxId: string | null;
  conversationId: string | null;
  /** Increments when workspace files change; triggers re-discovery */
  refreshTick?: number;
}

// ─── Language detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  json: "json",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
};

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getFileIcon(lang: string): string {
  switch (lang) {
    case "javascript":
    case "typescript":
      return "🟨";
    case "python":
      return "🐍";
    case "html":
      return "🌐";
    case "css":
      return "🎨";
    case "json":
      return "📋";
    case "markdown":
      return "📝";
    case "shell":
      return "⚡";
    default:
      return "📄";
  }
}

// ─── Simple syntax tokenizer ────────────────────────────────────────────────
// Lightweight token-based highlighting (no CodeMirror SSR issues)

interface Token {
  text: string;
  type: "keyword" | "string" | "comment" | "number" | "operator" | "function" | "plain";
}

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "class", "import", "export", "from", "default", "async", "await", "new",
  "this", "try", "catch", "throw", "typeof", "instanceof", "in", "of",
  "switch", "case", "break", "continue", "do", "true", "false", "null",
  "undefined", "void", "delete", "yield", "extends", "super", "static",
  "interface", "type", "enum", "implements", "readonly", "abstract",
]);

const PY_KEYWORDS = new Set([
  "def", "class", "import", "from", "return", "if", "elif", "else", "for",
  "while", "try", "except", "finally", "with", "as", "pass", "break",
  "continue", "and", "or", "not", "in", "is", "True", "False", "None",
  "lambda", "yield", "raise", "async", "await", "self",
]);

function tokenizeHtmlLine(line: string): Token[] {
  const tokens: Token[] = [];
  // HTML-aware regex: comments, tags (with attrs), strings, entities, text
  const regex = /(<!--[\s\S]*?-->|<\/?\w[\w-]*(?:\s[^>]*)?\s*\/?>|"[^"]*"|'[^']*'|&\w+;|[^<"'&]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    if (text.startsWith("<!--")) {
      tokens.push({ text, type: "comment" });
    } else if (text.startsWith("<")) {
      // Tokenize tag internals: tag name as keyword, attributes as plain, strings as string
      const inner = /(\/?>|<\/?|[\w-]+(?==)?|"[^"]*"|'[^']*'|=|[^<>"'=\s]+|\s+)/g;
      let part: RegExpExecArray | null;
      let tagNameSeen = false;
      while ((part = inner.exec(text)) !== null) {
        const p = part[0];
        if (p === "<" || p === "</" || p === ">" || p === "/>" || p === "/>") {
          tokens.push({ text: p, type: "operator" });
        } else if (!tagNameSeen && /^[\w-]+$/.test(p)) {
          tokens.push({ text: p, type: "keyword" });
          tagNameSeen = true;
        } else if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
          tokens.push({ text: p, type: "string" });
        } else if (p === "=") {
          tokens.push({ text: p, type: "operator" });
        } else if (/^[\w-]+$/.test(p)) {
          tokens.push({ text: p, type: "function" }); // attribute name
        } else {
          tokens.push({ text: p, type: "plain" });
        }
      }
    } else if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      tokens.push({ text, type: "string" });
    } else {
      tokens.push({ text, type: "plain" });
    }
  }
  return tokens;
}

function tokenizeCssLine(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\/\*[\s\S]*?\*\/|\/\/.*$|"[^"]*"|'[^']*'|[{}();:,]|#[\w-]+|\.[\w-]+|\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms)?|@[\w-]+|[\w-]+|\s+|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    if (text.startsWith("/*") || text.startsWith("//")) {
      tokens.push({ text, type: "comment" });
    } else if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      tokens.push({ text, type: "string" });
    } else if (text.startsWith("@")) {
      tokens.push({ text, type: "keyword" });
    } else if (text.startsWith("#") || text.startsWith(".")) {
      tokens.push({ text, type: "function" }); // selector
    } else if (/^\d/.test(text)) {
      tokens.push({ text, type: "number" });
    } else if (/^[{}();:,]$/.test(text)) {
      tokens.push({ text, type: "operator" });
    } else {
      tokens.push({ text, type: "plain" });
    }
  }
  return tokens;
}

function tokenizeShellLine(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(#.*$|"(?:\\.|[^"\\])*"|'[^']*'|\$\{[^}]*\}|\$[\w]+|\b\d+\.?\d*\b|[|;&><]+|\b(?:if|then|else|elif|fi|for|do|done|while|until|case|esac|function|return|local|export|source|echo|cat|grep|sed|awk|cd|ls|mkdir|rm|cp|mv|chmod|curl|wget)\b|[^\s]+|\s+)/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    if (text.startsWith("#")) {
      tokens.push({ text, type: "comment" });
    } else if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      tokens.push({ text, type: "string" });
    } else if (text.startsWith("$")) {
      tokens.push({ text, type: "function" }); // variables
    } else if (/^\d+\.?\d*$/.test(text)) {
      tokens.push({ text, type: "number" });
    } else if (/^[|;&><]+$/.test(text)) {
      tokens.push({ text, type: "operator" });
    } else if (/^(?:if|then|else|elif|fi|for|do|done|while|until|case|esac|function|return|local|export|source|echo|cat|grep|sed|awk|cd|ls|mkdir|rm|cp|mv|chmod|curl|wget)$/.test(text)) {
      tokens.push({ text, type: "keyword" });
    } else {
      tokens.push({ text, type: "plain" });
    }
  }
  return tokens;
}

function tokenizeLine(line: string, lang: string): Token[] {
  if (lang === "html") return tokenizeHtmlLine(line);
  if (lang === "css") return tokenizeCssLine(line);
  if (lang === "shell") return tokenizeShellLine(line);

  const tokens: Token[] = [];
  const keywords = lang === "python" ? PY_KEYWORDS : JS_KEYWORDS;

  // Simple regex-based tokenizer
  const regex =
    /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+\.?\d*\b|\b[a-zA-Z_$][\w$]*(?=\s*\()|[+\-*/%=!<>&|^~?:]+|\b[a-zA-Z_$][\w$]*\b|[^\s]+|\s+)/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];

    if (text.startsWith("//") || text.startsWith("#") || text.startsWith("/*")) {
      tokens.push({ text, type: "comment" });
    } else if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith("`") && text.endsWith("`"))
    ) {
      tokens.push({ text, type: "string" });
    } else if (/^\d+\.?\d*$/.test(text)) {
      tokens.push({ text, type: "number" });
    } else if (/^[a-zA-Z_$][\w$]*$/.test(text) && text.endsWith("(") === false && keywords.has(text)) {
      tokens.push({ text, type: "keyword" });
    } else if (/^[a-zA-Z_$][\w$]*(?=\s*\()/.test(text)) {
      tokens.push({ text, type: "function" });
    } else if (/^[+\-*/%=!<>&|^~?:]+$/.test(text)) {
      tokens.push({ text, type: "operator" });
    } else {
      tokens.push({ text, type: "plain" });
    }
  }

  return tokens;
}

const TOKEN_COLORS: Record<Token["type"], string> = {
  keyword: "text-purple-400",
  string: "text-green-400",
  comment: "text-white/25 italic",
  number: "text-amber-400",
  operator: "text-sky-300",
  function: "text-blue-400",
  plain: "text-white/70",
};

// ─── MiniFileTree ───────────────────────────────────────────────────────────

function MiniFileTree({
  files,
  activeFilePath,
  onSelect,
}: {
  files: Array<{ path: string; displayPath: string; language: string }>;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
}) {
  // Build recursive tree from flat file list (supports any nesting depth)
  // Uses displayPath for tree structure, but stores original path for selection
  const tree = useMemo(() => {
    const root: FileTreeItem[] = [];

    function ensureDir(children: FileTreeItem[], dirName: string, dirPath: string): FileTreeItem {
      let existing = children.find((c) => c.type === "directory" && c.name === dirName);
      if (!existing) {
        existing = { path: dirPath, name: dirName, type: "directory", children: [] };
        children.push(existing);
      }
      return existing;
    }

    for (const file of files) {
      const parts = file.displayPath.split("/");
      const fileName = parts.pop()!;

      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const dirPath = parts.slice(0, i + 1).join("/");
        const dir = ensureDir(current, parts[i], dirPath);
        current = dir.children!;
      }

      // Use original path for selection, displayPath-derived name for display
      current.push({ path: file.path, name: fileName, type: "file" });
    }

    return root;
  }, [files]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    // Expand all directories by default
    const allDirs = new Set<string>();
    function collectDirs(items: FileTreeItem[]) {
      for (const item of items) {
        if (item.type === "directory") {
          allDirs.add(item.path);
          if (item.children) collectDirs(item.children);
        }
      }
    }
    collectDirs(tree);
    return allDirs;
  });

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderItem = (item: FileTreeItem, depth: number = 0) => {
    const isDir = item.type === "directory";
    const isExpanded = expandedDirs.has(item.path);
    const isActive = item.path === activeFilePath;
    const lang = detectLanguage(item.name);

    return (
      <div key={item.path}>
        <button
          onClick={() => isDir ? toggleDir(item.path) : onSelect(item.path)}
          className={`w-full flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
            isActive
              ? "bg-[var(--primary)]/15 text-[var(--primary)]"
              : "text-white/40 hover:text-white/60 hover:bg-white/5"
          }`}
          style={{ paddingLeft: `${depth * 10 + 6}px` }}
        >
          {isDir ? (
            isExpanded ? (
              <ChevronDown className="h-2.5 w-2.5 shrink-0" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5 shrink-0" />
            )
          ) : (
            <span className="text-[8px] shrink-0">{getFileIcon(lang)}</span>
          )}
          <span className="truncate">{item.name}</span>
        </button>
        {isDir && isExpanded && item.children?.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  };

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col py-1 overflow-y-auto">
      {tree.map((item) => renderItem(item))}
    </div>
  );
}

// ─── FileTabs ───────────────────────────────────────────────────────────────

function FileTabs({
  files,
  activeFilePath,
  onSelect,
  onClose,
}: {
  files: Array<{ path: string; displayPath: string; language: string }>;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex items-center gap-0 border-b border-white/5 overflow-x-auto">
      {files.map((file) => {
        const name = getFileName(file.path);
        const isActive = file.path === activeFilePath;
        return (
          <div
            key={file.path}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-mono cursor-pointer border-b-2 shrink-0 transition-colors ${
              isActive
                ? "border-[var(--primary)] text-white/70 bg-white/5"
                : "border-transparent text-white/30 hover:text-white/50 hover:bg-white/3"
            }`}
            onClick={() => onSelect(file.path)}
          >
            <span className="text-[8px]">{getFileIcon(file.language)}</span>
            <span>{name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(file.path);
              }}
              className="ml-1 text-white/20 hover:text-white/50 transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── CodeView (syntax-highlighted with line numbers) ────────────────────────

function CodeView({
  content,
  language,
}: {
  content: string;
  language: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = content.split("\n");

  // Auto-scroll to bottom when content changes (streaming)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto font-mono text-[11px] leading-[18px]"
    >
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const tokens = tokenizeLine(line, language);
            return (
              <tr key={i} className="hover:bg-white/3">
                {/* Line number */}
                <td className="text-right pr-3 pl-3 select-none text-white/15 w-[1%] whitespace-nowrap align-top">
                  {i + 1}
                </td>
                {/* Code content */}
                <td className="pr-4 whitespace-pre">
                  {tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    tokens.map((token, ti) => (
                      <span key={ti} className={TOKEN_COLORS[token.type]}>
                        {token.text}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── CodeEditorPanel ────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Extensions that count as code files for auto-discovery
const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "html", "htm", "css", "scss",
  "json", "yaml", "yml", "sh", "bash", "sql", "rb", "go", "rs",
  "java", "c", "cpp", "h", "hpp", "md", "xml", "toml", "ini",
  "env", "dockerfile", "makefile",
]);

export default function CodeEditorPanel({
  activeFile,
  recentFiles,
  onFileSelect,
  sandboxId,
  conversationId,
  refreshTick = 0,
}: CodeEditorPanelProps) {
  const [closedFiles, setClosedFiles] = useState<Set<string>>(new Set());
  const [discoveredFiles, setDiscoveredFiles] = useState<Array<{ path: string; language: string }>>([]);
  const [lastDiscoveryTick, setLastDiscoveryTick] = useState(-1);

  // Discover code files from workspace API.
  // Runs on mount (if conversationId exists), and again whenever refreshTick changes
  // (signaling the agent wrote new files).
  useEffect(() => {
    if (!sandboxId || !conversationId) return;
    if (lastDiscoveryTick === refreshTick) return;

    const fetchWorkspaceFiles = async () => {
      try {
        const baseUrl = createWorkspaceApiUrl(API_BASE, sandboxId, "files", undefined, conversationId);
        const url = new URL(baseUrl);
        url.searchParams.set("depth", "3");
        url.searchParams.set("limit", "50");
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json();
        const items: Array<{ path: string; name: string; type: string }> = data.items ?? [];

        const codeFiles = items
          .filter((item) => {
            if (item.type !== "file") return false;
            const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
            return CODE_EXTENSIONS.has(ext);
          })
          .map((item) => ({
            path: item.path,
            language: detectLanguage(item.name),
          }));

        setDiscoveredFiles(codeFiles);
        // Auto-select first file if nothing is active
        if (codeFiles.length > 0 && !activeFile) {
          onFileSelect(codeFiles[0].path);
        }
      } catch { /* non-critical */ }
      setLastDiscoveryTick(refreshTick);
    };

    fetchWorkspaceFiles();
  }, [sandboxId, conversationId, refreshTick, lastDiscoveryTick, activeFile, onFileSelect]);

  // Reset on conversation change
  useEffect(() => {
    setDiscoveredFiles([]);
    setLastDiscoveryTick(-1);
  }, [conversationId]);

  // Strip session prefix from paths for cleaner display in tree/tabs
  const sessionPrefix = conversationId ? `sessions/${conversationId}/` : "";
  const stripPrefix = useCallback((p: string) =>
    sessionPrefix && p.startsWith(sessionPrefix) ? p.slice(sessionPrefix.length) : p,
  [sessionPrefix]);

  // Merge SSE-discovered files with API-discovered files (deduplicated)
  const allRecentFiles = useMemo(() => {
    const seen = new Set<string>();
    const merged: Array<{ path: string; displayPath: string; language: string }> = [];
    for (const f of recentFiles) {
      if (!seen.has(f.path)) { seen.add(f.path); merged.push({ ...f, displayPath: stripPrefix(f.path) }); }
    }
    for (const f of discoveredFiles) {
      if (!seen.has(f.path)) { seen.add(f.path); merged.push({ ...f, displayPath: stripPrefix(f.path) }); }
    }
    return merged;
  }, [recentFiles, discoveredFiles, stripPrefix]);

  const visibleRecentFiles = allRecentFiles.filter(
    (f) => !closedFiles.has(f.path)
  );

  const handleClose = useCallback((path: string) => {
    setClosedFiles((prev) => new Set([...prev, path]));
  }, []);

  // Empty state
  if (!activeFile && allRecentFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Code2 className="h-8 w-8 text-white/8 mb-3" />
        <p className="text-[11px] font-mono text-white/15">
          No files edited yet
        </p>
        <p className="text-[9px] font-mono text-white/10 mt-1">
          Files will appear here as the agent writes code
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* File tabs */}
      <FileTabs
        files={visibleRecentFiles}
        activeFilePath={activeFile?.path ?? null}
        onSelect={onFileSelect}
        onClose={handleClose}
      />

      <div className="flex flex-1 min-h-0">
        {/* Mini file tree sidebar */}
        {allRecentFiles.length > 0 && (
          <div className="w-[200px] border-r border-white/5 overflow-y-auto shrink-0">
            <div className="px-2 py-1.5 text-[9px] font-satoshi-bold text-white/20 uppercase tracking-widest">
              Files
            </div>
            <MiniFileTree
              files={allRecentFiles}
              activeFilePath={activeFile?.path ?? null}
              onSelect={onFileSelect}
            />
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* File path breadcrumb */}
          {activeFile && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 bg-white/2">
              <FileCode className="h-3 w-3 text-white/20" />
              <span className="text-[9px] font-mono text-white/30 truncate">
                {activeFile.path}
              </span>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <span className="text-[8px] font-mono text-white/15 bg-white/5 px-1.5 py-0.5 rounded">
                  {activeFile.content.split("\n").length} lines
                </span>
                <span className="text-[8px] font-mono text-white/15 bg-white/5 px-1.5 py-0.5 rounded">
                  {activeFile.language}
                </span>
              </div>
            </div>
          )}

          {/* Code content */}
          {activeFile ? (
            <CodeView
              content={activeFile.content}
              language={activeFile.language}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[10px] font-mono text-white/15">
                Select a file to view
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
