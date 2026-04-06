import { posix as pathPosix } from "node:path";
import { joinShellArgs } from "./docker";

export type WorkspacePreviewKind = "text" | "image" | "pdf" | "binary";
export type WorkspaceArtifactType = "webpage" | "document" | "data" | "code" | "image" | "archive" | "other";

const ARCHIVE_MAX_FILES = 250;
const ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
const HANDOFF_SUGGESTED_LIMIT = 5;
const ARTIFACT_MANIFEST_FILE = ".openclaw-artifacts.json";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".yml", ".yaml", ".html", ".htm",
  ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".sh",
  ".bash", ".zsh", ".sql", ".xml", ".csv", ".log",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const DOCUMENT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".pdf", ".log"]);
const DATA_EXTENSIONS = new Set([".json", ".yml", ".yaml", ".csv", ".xml"]);
const CODE_EXTENSIONS = new Set([
  ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".sh", ".bash", ".zsh", ".sql",
]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz"]);

function getLowercaseExtension(relativePath: string): string {
  const lowerPath = relativePath.toLowerCase();
  const extIndex = lowerPath.lastIndexOf(".");
  return extIndex >= 0 ? lowerPath.slice(extIndex) : "";
}

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
  const ext = getLowercaseExtension(relativePath);

  if (mime === "application/pdf" || lowerPath.endsWith(".pdf")) {
    return "pdf";
  }
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (
    mime.startsWith("text/")
    || mime.includes("json")
    || mime.includes("javascript")
    || mime.includes("typescript")
    || mime.includes("xml")
    || mime.includes("yaml")
    || TEXT_EXTENSIONS.has(ext)
  ) {
    return "text";
  }
  return "binary";
}

export function classifyWorkspaceArtifactType(
  relativePath: string,
  mimeType?: string | null,
  previewKind?: WorkspacePreviewKind,
): WorkspaceArtifactType {
  const lowerPath = relativePath.toLowerCase();
  const mime = String(mimeType ?? "").toLowerCase();
  const ext = getLowercaseExtension(relativePath);
  const resolvedPreviewKind = previewKind ?? classifyWorkspacePreview(relativePath, mimeType);

  if (resolvedPreviewKind === "image") return "image";
  if (mime === "text/html" || lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "webpage";
  if (mime === "application/pdf" || ext === ".pdf") return "document";
  if (mime.includes("markdown") || DOCUMENT_EXTENSIONS.has(ext)) return "document";
  if (mime.includes("json") || mime.includes("yaml") || mime.includes("xml") || mime.includes("csv") || DATA_EXTENSIONS.has(ext)) {
    return "data";
  }
  if (mime.includes("javascript") || mime.includes("typescript") || CODE_EXTENSIONS.has(ext)) return "code";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (resolvedPreviewKind === "text") return "document";
  return "other";
}

function createWorkspaceNodeScript(): string {
  return `
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const payload = JSON.parse(process.argv[1] || "{}");
const workspaceRoot = path.join(os.homedir(), ".openclaw", "workspace");
const ARCHIVE_MAX_FILES = ${ARCHIVE_MAX_FILES};
const ARCHIVE_MAX_BYTES = ${ARCHIVE_MAX_BYTES};
const HANDOFF_SUGGESTED_LIMIT = ${HANDOFF_SUGGESTED_LIMIT};
const ARTIFACT_MANIFEST_FILE = ${JSON.stringify(ARTIFACT_MANIFEST_FILE)};

const textExt = new Set(${JSON.stringify(Array.from(TEXT_EXTENSIONS))});
const imageExt = new Set(${JSON.stringify(Array.from(IMAGE_EXTENSIONS))});
const documentExt = new Set(${JSON.stringify(Array.from(DOCUMENT_EXTENSIONS))});
const dataExt = new Set(${JSON.stringify(Array.from(DATA_EXTENSIONS))});
const codeExt = new Set(${JSON.stringify(Array.from(CODE_EXTENSIONS))});
const archiveExt = new Set(${JSON.stringify(Array.from(ARCHIVE_EXTENSIONS))});
const artifactManifestCache = new Map();

function getExtension(relativePath) {
  const lowerPath = String(relativePath || "").toLowerCase();
  const extIndex = lowerPath.lastIndexOf(".");
  return extIndex >= 0 ? lowerPath.slice(extIndex) : "";
}

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
  const ext = getExtension(relativePath);
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

function classifyArtifact(relativePath, mimeType, previewKind) {
  const lowerPath = String(relativePath || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  const ext = getExtension(relativePath);
  const resolvedPreviewKind = previewKind || classifyPreview(relativePath, mimeType);
  if (resolvedPreviewKind === "image") return "image";
  if (mime === "text/html" || lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "webpage";
  if (mime === "application/pdf" || ext === ".pdf") return "document";
  if (mime.includes("markdown") || documentExt.has(ext)) return "document";
  if (mime.includes("json") || mime.includes("yaml") || mime.includes("xml") || mime.includes("csv") || dataExt.has(ext)) return "data";
  if (mime.includes("javascript") || mime.includes("typescript") || codeExt.has(ext)) return "code";
  if (archiveExt.has(ext)) return "archive";
  if (resolvedPreviewKind === "text") return "document";
  return "other";
}

async function loadArtifactManifest(sessionId) {
  if (artifactManifestCache.has(sessionId)) {
    return artifactManifestCache.get(sessionId);
  }

  const manifestPath = path.join(workspaceRoot, "sessions", sessionId, ARTIFACT_MANIFEST_FILE);
  let parsed = null;
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  artifactManifestCache.set(sessionId, parsed);
  return parsed;
}

async function resolveArtifactMetadata(relativePath) {
  const parts = String(relativePath || "").split("/").filter(Boolean);
  if (parts[0] !== "sessions" || !parts[1]) {
    return {
      source_conversation_id: null,
      source_conversation_turn: null,
      output_label: null,
      source_description: null,
    };
  }

  const sessionId = parts[1];
  const relativeWithinSession = parts.slice(2).join("/");
  const manifest = await loadArtifactManifest(sessionId);
  const fileMap = manifest && typeof manifest === "object" && manifest.files && typeof manifest.files === "object"
    ? manifest.files
    : null;
  const fileMetadata = fileMap && relativeWithinSession ? fileMap[relativeWithinSession] : null;

  return {
    source_conversation_id: sessionId,
    source_conversation_turn: fileMetadata && typeof fileMetadata.source_conversation_turn === "string"
      ? fileMetadata.source_conversation_turn
      : null,
    output_label: fileMetadata && typeof fileMetadata.output_label === "string"
      ? fileMetadata.output_label
      : null,
    source_description: fileMetadata && typeof fileMetadata.source_description === "string"
      ? fileMetadata.source_description
      : null,
  };
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
      const previewKind = classifyPreview(relativePath, mimeType);
      const artifactMetadata = await resolveArtifactMetadata(relativePath);
      results.push({
        path: relativePath,
        name: entry.name,
        type: "file",
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
        mime_type: mimeType,
        preview_kind: previewKind,
        artifact_type: classifyArtifact(relativePath, mimeType, previewKind),
        ...artifactMetadata,
      });
    }
  }

  await walk(targetPath, 0);
  results.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
  console.log(JSON.stringify({ root: payload.path || "", items: results.slice(0, limit) }));
}

async function collectWorkspaceFiles(targetPath, maxFiles) {
  const results = [];
  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      if (results.length >= maxFiles) return;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await fs.stat(absolutePath);
      const relativePath = path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
      const mimeType = guessMimeType(relativePath);
      const previewKind = classifyPreview(relativePath, mimeType);
      const artifactMetadata = await resolveArtifactMetadata(relativePath);
      results.push({
        path: relativePath,
        name: entry.name,
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
        mime_type: mimeType,
        preview_kind: previewKind,
        artifact_type: classifyArtifact(relativePath, mimeType, previewKind),
        ...artifactMetadata,
      });
    }
  }

  await walk(targetPath);
  results.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
  return results;
}

function summarizeWorkspace(files) {
  const fileCount = files.length;
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const codeFiles = files.filter((file) => file.preview_kind === "text");
  const codeFileCount = codeFiles.length;
  const topLevelPaths = Array.from(new Set(files.map((file) => String(file.path).split("/")[0]).filter(Boolean))).slice(0, 6);
  const suggestedPaths = codeFiles.slice(0, HANDOFF_SUGGESTED_LIMIT).map((file) => file.path);

  let summary = "No workspace files available yet.";
  if (fileCount > 0 && codeFileCount > 0) {
    summary = \`\${codeFileCount} code file\${codeFileCount === 1 ? "" : "s"} ready for handoff\`;
  } else if (fileCount > 0) {
    summary = \`\${fileCount} workspace file\${fileCount === 1 ? "" : "s"} ready for handoff\`;
  }

  let archiveReason = null;
  if (fileCount === 0) archiveReason = "workspace_empty";
  else if (fileCount > ARCHIVE_MAX_FILES) archiveReason = "too_many_files";
  else if (totalBytes > ARCHIVE_MAX_BYTES) archiveReason = "archive_too_large";

  const archiveEligible = archiveReason === null;
  return {
    summary,
    file_count: fileCount,
    code_file_count: codeFileCount,
    total_bytes: totalBytes,
    top_level_paths: topLevelPaths,
    suggested_paths: suggestedPaths,
    archive: {
      eligible: archiveEligible,
      reason: archiveReason,
      file_count: fileCount,
      total_bytes: totalBytes,
      download_name: String(payload.downloadName || "workspace-bundle.tar.gz"),
    },
  };
}

async function outputWorkspaceHandoff(targetPath) {
  const files = await collectWorkspaceFiles(targetPath, ARCHIVE_MAX_FILES + 1);
  console.log(JSON.stringify(summarizeWorkspace(files)));
}

async function outputWorkspaceArchive(targetPath) {
  const files = await collectWorkspaceFiles(targetPath, ARCHIVE_MAX_FILES + 1);
  const handoff = summarizeWorkspace(files);
  if (!handoff.archive.eligible) {
    throw new Error(\`Archive unavailable: \${handoff.archive.reason}\`);
  }

  const relativeTarget = path.relative(workspaceRoot, targetPath);
  const archiveBaseName = String(payload.downloadName || "workspace-bundle.tar.gz");
  const tarArgs = ["-czf", "-", "-C", workspaceRoot];
  if (!relativeTarget || relativeTarget === "") {
    tarArgs.push(".");
  } else {
    tarArgs.push(relativeTarget);
  }

  const { stdout } = await execFileAsync("tar", tarArgs, { encoding: "buffer", maxBuffer: ARCHIVE_MAX_BYTES * 3 });
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  console.log(JSON.stringify({
    mime_type: "application/gzip",
    download_name: archiveBaseName,
    base64: bytes.toString("base64"),
  }));
}

async function readFilePayload(targetPath, relativePath, mode) {
  const stats = await fs.stat(targetPath);
  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  const mimeType = guessMimeType(relativePath);
  const previewKind = classifyPreview(relativePath, mimeType);
  const artifactMetadata = await resolveArtifactMetadata(relativePath);
  const base = {
    path: relativePath,
    name: path.basename(relativePath),
    type: "file",
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
    mime_type: mimeType,
    preview_kind: previewKind,
    artifact_type: classifyArtifact(relativePath, mimeType, previewKind),
    ...artifactMetadata,
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
  // ── Status mode: lightweight workspace summary (no path required) ──
  if (payload.mode === "status") {
    const result = { soul_exists: false, agents_md_exists: false, skill_count: 0, tool_count: 0, trigger_count: 0, skill_ids: [], last_modified: null };
    try { await fs.access(path.join(workspaceRoot, "SOUL.md")); result.soul_exists = true; } catch {}
    try { await fs.access(path.join(workspaceRoot, "AGENTS.md")); result.agents_md_exists = true; } catch {}
    try {
      const entries = await fs.readdir(path.join(workspaceRoot, "skills"), { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      result.skill_count = dirs.length;
      result.skill_ids = dirs.map(e => e.name);
    } catch {}
    try { const t = await fs.readdir(path.join(workspaceRoot, "tools")); result.tool_count = t.filter(f => f.endsWith(".json")).length; } catch {}
    try { const t = await fs.readdir(path.join(workspaceRoot, "triggers")); result.trigger_count = t.filter(f => f.endsWith(".json")).length; } catch {}
    console.log(JSON.stringify(result));
    return;
  }

  const targetPath = path.join(workspaceRoot, payload.path || "");
  ensureInsideWorkspace(targetPath);
  const stats = await fs.stat(targetPath);

  if (payload.mode === "list") {
    if (!stats.isDirectory()) throw new Error("Path is not a directory");
    await listFiles(targetPath, Number(payload.depth || 2), Number(payload.limit || 200));
    return;
  }

  if (payload.mode === "handoff") {
    if (!stats.isDirectory()) throw new Error("Path is not a directory");
    await outputWorkspaceHandoff(targetPath);
    return;
  }

  if (payload.mode === "archive") {
    if (!stats.isDirectory()) throw new Error("Path is not a directory");
    await outputWorkspaceArchive(targetPath);
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

export function createWorkspaceHandoffCommand(relativePath: string, downloadName?: string): string {
  return createWorkspaceCommand({ mode: "handoff", path: relativePath, downloadName });
}

export function createWorkspaceArchiveCommand(relativePath: string, downloadName?: string): string {
  return createWorkspaceCommand({ mode: "archive", path: relativePath, downloadName });
}

export function createWorkspaceStatusCommand(): string {
  return createWorkspaceCommand({ mode: "status" });
}
