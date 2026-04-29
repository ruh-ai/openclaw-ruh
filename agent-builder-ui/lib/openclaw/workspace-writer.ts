/**
 * workspace-writer.ts — Client-side helpers for writing files
 * to a sandbox workspace via the backend REST API.
 */

import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface WriteFileResult {
  path: string;
  ok: boolean;
  error?: string;
}

export interface WriteBatchResult {
  ok: boolean;
  results: WriteFileResult[];
  failed: number;
  succeeded: number;
}

/**
 * Read a single file from the sandbox workspace.
 * Tries copilot workspace first (where builds write), falls back to main workspace.
 */
export async function readWorkspaceFile(
  sandboxId: string,
  path: string,
): Promise<string | null> {
  const cacheBust = `&_=${Date.now()}`;

  // Try copilot workspace first (copilot-mode builds write here)
  const copilotRes = await fetchBackendWithAuth(
    `${API_BASE}/api/sandboxes/${sandboxId}/workspace-copilot/file?path=${encodeURIComponent(path)}${cacheBust}`,
    { cache: "no-store" },
  );
  if (copilotRes.ok) {
    try {
      const data = await copilotRes.json();
      if (typeof data.content === "string") return data.content;
    } catch { /* fall through */ }
  }

  // Fall back to main workspace
  const res = await fetchBackendWithAuth(
    `${API_BASE}/api/sandboxes/${sandboxId}/workspace/file?path=${encodeURIComponent(path)}${cacheBust}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return typeof data.content === "string" ? data.content : null;
  } catch {
    return null;
  }
}

/**
 * Write a single file to the sandbox workspace.
 */
export async function writeWorkspaceFile(
  sandboxId: string,
  path: string,
  content: string,
): Promise<WriteFileResult> {
  const res = await fetchBackendWithAuth(
    `${API_BASE}/api/sandboxes/${sandboxId}/workspace/write`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { path, ok: false, error: `HTTP ${res.status}: ${text}` };
  }
  return res.json();
}

/**
 * Merge workspace-copilot/ into workspace/.
 * Call this after the v3 build completes so the ship step can read
 * all build artifacts from the standard workspace path.
 */
export async function mergeWorkspaceCopilotToMain(
  sandboxId: string,
): Promise<boolean> {
  const res = await fetchBackendWithAuth(
    `${API_BASE}/api/sandboxes/${sandboxId}/workspace/merge-copilot`,
    { method: "POST" },
  );
  return res.ok;
}

/**
 * Write multiple files to the sandbox workspace in a single batch.
 * Maximum 50 files per call.
 */
export async function writeWorkspaceFiles(
  sandboxId: string,
  files: Array<{ path: string; content: string }>,
): Promise<WriteBatchResult> {
  const res = await fetchBackendWithAuth(
    `${API_BASE}/api/sandboxes/${sandboxId}/workspace/write-batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      results: files.map((f) => ({ path: f.path, ok: false, error: `HTTP ${res.status}: ${text}` })),
      failed: files.length,
      succeeded: 0,
    };
  }
  return res.json();
}
