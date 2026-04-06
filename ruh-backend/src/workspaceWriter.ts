/**
 * workspaceWriter.ts — Write files to a sandbox's workspace directory.
 *
 * Uses docker exec + buildHomeFileWriteCommand to write files atomically.
 * Path validation prevents traversal outside the workspace root.
 */

import { buildHomeFileWriteCommand, dockerExec, getContainerName } from './docker';
import { normalizeWorkspaceRelativePath } from './workspaceFiles';

const MAX_FILE_SIZE_BYTES = 1_024 * 1_024; // 1 MB per file
const MAX_BATCH_SIZE = 50;
const WRITE_TIMEOUT_MS = 30_000;

// Paths that have dedicated endpoints and should not be overwritten via generic write
const BLOCKED_PATHS = new Set(['.env', 'mcp.json']);

export interface WriteFileResult {
  path: string;
  ok: boolean;
  error?: string;
}

/**
 * Validate a workspace-relative path for writing.
 * Throws on invalid paths. Returns the normalized path.
 */
function validateWritePath(rawPath: string): string {
  const normalized = normalizeWorkspaceRelativePath(rawPath);
  if (!normalized) {
    throw new Error('Path cannot be empty');
  }

  // Block paths with dedicated endpoints
  const basename = normalized.split('/').pop() ?? '';
  if (BLOCKED_PATHS.has(basename)) {
    throw new Error(`Cannot write to ${basename} — use the dedicated endpoint`);
  }

  return normalized;
}

/**
 * Write a single file to a sandbox's workspace.
 */
export async function writeWorkspaceFile(
  sandboxId: string,
  relativePath: string,
  content: string,
): Promise<WriteFileResult> {
  const path = validateWritePath(relativePath);

  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    return { path, ok: false, error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024}KB limit` };
  }

  const containerName = getContainerName(sandboxId);
  // Write to workspace-copilot/ — the copilot build workspace.
  // After build completes, the orchestrator merges these into workspace/
  // so the existing ship infrastructure reads them from the standard path.
  const workspacePath = `.openclaw/workspace-copilot/${path}`;

  try {
    const cmd = buildHomeFileWriteCommand(workspacePath, content);
    const [ok, output] = await dockerExec(containerName, cmd, WRITE_TIMEOUT_MS);
    if (!ok) {
      return { path, ok: false, error: output || 'Write command failed' };
    }
    return { path, ok: true };
  } catch (err) {
    return {
      path,
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown write error',
    };
  }
}

/**
 * Merge workspace-copilot/ into workspace/.
 * Copies all files from copilot build workspace into the main workspace
 * so the existing ship infrastructure can read them.
 * Skips .git/ and workspace-state.json.
 */
export async function mergeWorkspaceCopilotToMain(sandboxId: string): Promise<boolean> {
  const containerName = getContainerName(sandboxId);
  const cmd = [
    // Copy all non-git files from workspace-copilot/ to workspace/
    'cd $HOME/.openclaw/workspace-copilot',
    '&&',
    'find . -type f -not -path "./.git/*" -not -name "workspace-state.json"',
    '-exec sh -c \'mkdir -p "$HOME/.openclaw/workspace/$(dirname "$1")" && cp "$1" "$HOME/.openclaw/workspace/$1"\' _ {} \\;',
  ].join(' ');
  const [ok, output] = await dockerExec(containerName, cmd, 60_000);
  if (!ok) {
    console.error(`[workspace-writer] Merge failed for sandbox ${sandboxId}:`, output);
  }
  return ok;
}

/**
 * Read a file from the sandbox's copilot workspace.
 * Returns the file content or null if not found.
 */
export async function readWorkspaceCopilotFile(
  sandboxId: string,
  relativePath: string,
): Promise<string | null> {
  const path = validateWritePath(relativePath);
  const containerName = getContainerName(sandboxId);
  const workspacePath = `.openclaw/workspace-copilot/${path}`;
  try {
    const [ok, output] = await dockerExec(
      containerName,
      `cat $HOME/${workspacePath} 2>/dev/null`,
      WRITE_TIMEOUT_MS,
    );
    return ok ? output : null;
  } catch {
    return null;
  }
}

/**
 * Write multiple files to a sandbox's workspace in a single batch.
 */
export async function writeWorkspaceFiles(
  sandboxId: string,
  files: Array<{ path: string; content: string }>,
): Promise<WriteFileResult[]> {
  if (files.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size ${files.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
  }

  // Write files sequentially to avoid overwhelming the container
  const results: WriteFileResult[] = [];
  for (const file of files) {
    const result = await writeWorkspaceFile(sandboxId, file.path, file.content);
    results.push(result);
  }
  return results;
}
