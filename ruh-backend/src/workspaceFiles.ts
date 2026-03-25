import { posix as pathPosix } from "node:path";
import { joinShellArgs } from "./docker";

export type WorkspacePreviewKind = "text" | "image" | "pdf" | "binary";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".yml", ".yaml", ".html", ".htm",
  ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".sh",
  ".bash", ".zsh", ".sql", ".xml", ".csv", ".log",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

export function normalizeWorkspaceRelativePath(input?: string | null): string {
  if (input == null) return "";

  const trimmed = String(input).trim();
  if (!trimmed || trimmed === "." || trimmed === "./") {
    return "";
  }
  if (trimmed.includes("\u0000")) {
    throw new Error("Path contains invalid characters");
  }

  const slashNormalized = trimmed.replace(/\\/g, "/");
  if (slashNormalized.startsWith("/")) {
    throw new Error("Path must be relative to the workspace root");
  }

  const normalized = pathPosix.normalize(slashNormalized);
  if (normalized === "." || normalized === "./") {
    return "";
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Path must stay within the workspace root");
  }

  return normalized
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");
}

export function guessWorkspaceMimeType(relativePath: string): string {
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) return "text/markdown";
  if (lowerPath.endsWith(".json")) return "application/json";
  if (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml")) return "application/yaml";
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "text/html";
  if (lowerPath.endsWith(".css")) return "text/css";
  if (lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs") || lowerPath.endsWith(".cjs")) return "text/javascript";
  if (lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx")) return "text/typescript";
  if (lowerPath.endsWith(".csv")) return "text/csv";
  if (lowerPath.endsWith(".xml")) return "application/xml";
  if (lowerPath.endsWith(".pdf")) return "application/pdf";
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export function classifyWorkspacePreview(relativePath: string, mimeType?: string | null): WorkspacePreviewKind {
  const lowerPath = relativePath.toLowerCase();
  const mime = String(mimeType ?? "").toLowerCase();

  if (mime === "application/pdf" || lowerPath.endsWith(".pdf")) {
    return "pdf";
  }
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(lowerPath.slice(lowerPath.lastIndexOf(".")))) {
    return "image";
  }
  if (
    mime.startsWith("text/")
    || mime.includes("json")
    || mime.includes("javascript")
    || mime.includes("typescript")
    || mime.includes("xml")
    || mime.includes("yaml")
    || TEXT_EXTENSIONS.has(lowerPath.slice(lowerPath.lastIndexOf(".")))
  ) {
    return "text";
  }
  return "binary";
}

function createWorkspaceNodeScript(): string {
  return `
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const payload = JSON.parse(process.argv[1] || "{}");
const workspaceRoot = path.join(os.homedir(), ".openclaw", "workspace");

const textExt = new Set(${JSON.stringify(Array.from(TEXT_EXTENSIONS))});
const imageExt = new Set(${JSON.stringify(Array.from(IMAGE_EXTENSIONS))});

function guessMimeType(relativePath) {
  const lowerPath = String(relativePath || "").toLowerCase();
  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) return "text/markdown";
  if (lowerPath.endsWith(".json")) return "application/json";
  if (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml")) return "application/yaml";
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "text/html";
  if (lowerPath.endsWith(".css")) return "text/css";
  if (lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs") || lowerPath.endsWith(".cjs")) return "text/javascript";
  if (lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx")) return "text/typescript";
  if (lowerPath.endsWith(".csv")) return "text/csv";
  if (lowerPath.endsWith(".xml")) return "application/xml";
  if (lowerPath.endsWith(".pdf")) return "application/pdf";
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function classifyPreview(relativePath, mimeType) {
  const lowerPath = String(relativePath || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  const ext = lowerPath.slice(lowerPath.lastIndexOf("."));
  if (mime === "application/pdf" || lowerPath.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || imageExt.has(ext)) return "image";
  if (
    mime.startsWith("text/")
    || mime.includes("json")
    || mime.includes("javascript")
    || mime.includes("typescript")
    || mime.includes("xml")
    || mime.includes("yaml")
    || textExt.has(ext)
  ) {
    return "text";
  }
  return "binary";
}

function ensureInsideWorkspace(targetPath) {
  const relative = path.relative(workspaceRoot, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes workspace root");
  }
}

async function listFiles(targetPath, depth, limit) {
  const results = [];
  async function walk(currentPath, currentDepth) {
    if (results.length >= limit || currentDepth > depth) return;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      if (results.length >= limit) break;
      const absolutePath = path.join(currentPath, entry.name);
      const stats = await fs.stat(absolutePath);
      if (entry.isDirectory()) {
        if (currentDepth < depth) {
          await walk(absolutePath, currentDepth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
      const mimeType = guessMimeType(relativePath);
      results.push({
        path: relativePath,
        name: entry.name,
        type: "file",
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
        mime_type: mimeType,
        preview_kind: classifyPreview(relativePath, mimeType),
      });
    }
  }

  await walk(targetPath, 0);
  results.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
  console.log(JSON.stringify({ root: payload.path || "", items: results.slice(0, limit) }));
}

async function readFilePayload(targetPath, relativePath, mode) {
  const stats = await fs.stat(targetPath);
  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  const mimeType = guessMimeType(relativePath);
  const previewKind = classifyPreview(relativePath, mimeType);
  const base = {
    path: relativePath,
    name: path.basename(relativePath),
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
    mime_type: mimeType,
    preview_kind: previewKind,
    download_name: path.basename(relativePath),
  };

  if (mode === "download") {
    const bytes = await fs.readFile(targetPath);
    console.log(JSON.stringify({
      ...base,
      base64: bytes.toString("base64"),
    }));
    return;
  }

  if (previewKind !== "text") {
    console.log(JSON.stringify(base));
    return;
  }

  const maxBytes = Number(payload.maxBytes || 200000);
  const bytes = await fs.readFile(targetPath);
  const truncated = bytes.length > maxBytes;
  const content = bytes.subarray(0, maxBytes).toString("utf8");
  console.log(JSON.stringify({
    ...base,
    content,
    truncated,
  }));
}

(async () => {
  const targetPath = path.join(workspaceRoot, payload.path || "");
  ensureInsideWorkspace(targetPath);
  const stats = await fs.stat(targetPath);

  if (payload.mode === "list") {
    if (!stats.isDirectory()) throw new Error("Path is not a directory");
    await listFiles(targetPath, Number(payload.depth || 2), Number(payload.limit || 200));
    return;
  }

  await readFilePayload(targetPath, payload.path || "", payload.mode);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`.trim();
}

function createWorkspaceCommand(payload: Record<string, unknown>): string {
  return `${joinShellArgs(["node", "-e", createWorkspaceNodeScript(), JSON.stringify(payload)])} 2>&1`;
}

export function createWorkspaceListCommand(relativePath: string, depth: number, limit: number): string {
  return createWorkspaceCommand({ mode: "list", path: relativePath, depth, limit });
}

export function createWorkspaceReadCommand(relativePath: string, maxBytes = 200_000): string {
  return createWorkspaceCommand({ mode: "read", path: relativePath, maxBytes });
}

export function createWorkspaceDownloadCommand(relativePath: string): string {
  return createWorkspaceCommand({ mode: "download", path: relativePath });
}
