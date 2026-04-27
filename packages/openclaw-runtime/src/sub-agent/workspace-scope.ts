/**
 * Workspace scope — lexical path-safety validator.
 *
 * Implements: docs/spec/openclaw-v1/007-sub-agent.md §path-safety-rules
 *
 * The substrate enforces the LEXICAL portion of the spec's path-safety
 * rules; filesystem-layer adapters layer realpath / symlink / cross-
 * device checks on top.
 *
 * Rules implemented here (substrate, deterministic, no I/O):
 *   1. Reject absolute paths (POSIX `/...`, Windows `C:\...` / `\\?\...`)
 *   2. Reject scheme-prefixed paths (`file://`, `http://`, etc.)
 *   3. Lexical normalization: collapse `.` segments, resolve `..` segments,
 *      reject any path that resolves above the workspace root
 *   5. Scope containment: the resolved path's prefix MUST equal the
 *      resolved workspace_scope (segment-aligned, case-sensitive)
 *
 * Rules deferred to filesystem-layer adapters (out of scope for substrate):
 *   4. Realpath resolution + O_NOFOLLOW (symlink rejection)
 *   6. No-cross-device check
 *   7. Atomic-rename writes
 *   8. Write-during-merge lock
 */

// ─── Public API ───────────────────────────────────────────────────────

export type ScopeViolationReason =
  | "absolute_path"
  | "scheme_prefix"
  | "control_chars"
  | "escapes_workspace"
  | "outside_scope";

export type ScopeCheckResult =
  | { readonly outcome: "allow"; readonly normalizedPath: string }
  | {
      readonly outcome: "reject";
      readonly reason: ScopeViolationReason;
      readonly details?: string;
    };

/**
 * Validate that `requestedPath` is safe to read/write from a sub-agent
 * scoped to `workspaceScope`. All inputs are workspace-relative; absolute
 * inputs are rejected.
 *
 * `workspaceScope` itself is normalized first; if it's empty, the entire
 * pipeline workspace is in scope (privileged or orchestrator-level
 * agents may use this — the substrate doesn't gate that).
 */
export function checkScope(
  requestedPath: string,
  workspaceScope: string,
): ScopeCheckResult {
  // Rule 1 — absolute paths
  if (isAbsolute(requestedPath)) {
    return { outcome: "reject", reason: "absolute_path" };
  }
  // Rule 2 — scheme prefixes
  if (hasSchemePrefix(requestedPath)) {
    return { outcome: "reject", reason: "scheme_prefix" };
  }
  // NUL + control chars (defence in depth — these break filesystem APIs)
  if (hasControlChars(requestedPath) || hasControlChars(workspaceScope)) {
    return { outcome: "reject", reason: "control_chars" };
  }

  // Rule 3 — normalize. If after normalization the path begins with `..`
  // we've escaped the workspace root.
  const normalized = lexicalNormalize(requestedPath);
  if (normalized === undefined) {
    return { outcome: "reject", reason: "escapes_workspace" };
  }

  const normalizedScope = lexicalNormalize(workspaceScope) ?? "";

  // Empty scope = workspace root. Anything inside the workspace is in scope.
  if (normalizedScope === "") {
    return { outcome: "allow", normalizedPath: normalized };
  }

  // Rule 5 — scope containment, segment-aligned.
  if (!isUnderScope(normalized, normalizedScope)) {
    return { outcome: "reject", reason: "outside_scope" };
  }

  return { outcome: "allow", normalizedPath: normalized };
}

/**
 * Convenience: throws `ScopeViolationError` rather than returning a
 * discriminated union. Useful when the caller's only sensible response
 * to a violation is to abort.
 */
export function assertInScope(
  requestedPath: string,
  workspaceScope: string,
): string {
  const r = checkScope(requestedPath, workspaceScope);
  if (r.outcome === "reject") {
    throw new ScopeViolationError(requestedPath, workspaceScope, r.reason);
  }
  return r.normalizedPath;
}

export class ScopeViolationError extends Error {
  readonly category = "permission_denied" as const;
  constructor(
    public readonly requestedPath: string,
    public readonly workspaceScope: string,
    public readonly reason: ScopeViolationReason,
  ) {
    super(
      `path "${requestedPath}" is not allowed under workspace_scope "${workspaceScope}" — ${reason}`,
    );
    this.name = "ScopeViolationError";
  }
}

// ─── Internals ────────────────────────────────────────────────────────

function isAbsolute(p: string): boolean {
  if (p.length === 0) return false;
  if (p.startsWith("/")) return true;
  // Windows drive: "C:\" or "C:/"
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  // UNC / device path: "\\server\share" or "\\?\..."
  if (p.startsWith("\\\\")) return true;
  return false;
}

function hasSchemePrefix(p: string): boolean {
  // Match schemes like file://, http://, https://, data:, ftp:// etc.
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?/.test(p);
}

function hasControlChars(p: string): boolean {
  for (let i = 0; i < p.length; i++) {
    const code = p.charCodeAt(i);
    // Reject NUL and other low-control chars; tab/newline included for safety.
    if (code < 0x20) return true;
    if (code === 0x7f) return true;
  }
  return false;
}

/**
 * Lexically normalize a workspace-relative path. Collapses `.` and `..`,
 * removes redundant separators, removes leading and trailing slashes.
 * Returns `undefined` if a `..` would escape above the workspace root.
 */
export function lexicalNormalize(p: string): string | undefined {
  // Convert backslashes to forward slashes for Windows tolerance, then
  // collapse multiple slashes.
  const unified = p.replace(/\\/g, "/").replace(/\/+/g, "/");
  // Strip leading/trailing slashes — workspace-relative paths don't carry them.
  const trimmed = unified.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "";
  const segments = trimmed.split("/");
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return undefined; // escapes workspace
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join("/");
}

/**
 * Segment-aligned containment. `path` is under `scope` iff `path === scope`
 * OR `path` starts with `scope + "/"`. String-prefix without the slash
 * would let `deliverables/takeoff` match scope `deliverables/take` —
 * that's the bug we explicitly avoid.
 */
function isUnderScope(path: string, scope: string): boolean {
  if (path === scope) return true;
  return path.startsWith(scope + "/");
}
