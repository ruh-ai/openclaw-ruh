# SPEC: Deployed Chat Files And Artifacts Workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-deployed-chat-artifact-preview]]

## Status

implemented

## Summary

The deployed-agent chat page now exposes a bounded Files workspace so operators can inspect sandbox outputs without mining assistant prose or terminal snippets. The first slice adds backend routes for safe workspace listing, text-file reads, and downloads under the sandbox workspace root, then layers a Files tab into the chat workspace with inline previews for common text and image outputs plus PDF/download metadata.

## Related Notes

- [[004-api-reference]] — documents the workspace list/read/download route contract
- [[008-agent-builder-ui]] — owns the deployed-agent Files tab, preview panes, and run-scoped workspace state
- [[011-key-flows]] — explains how operators move from a chat run to inspecting sandbox files and artifacts
- [[SPEC-deployed-chat-artifact-preview]] — extends the first slice with artifact-aware classification, rich previews, and an output gallery

## Specification

### Backend Workspace Contract

The first shipped slice adds three bounded backend routes under one sandbox:

- `GET /api/sandboxes/:sandbox_id/workspace/files`
  - returns a bounded recursive listing rooted at `~/.openclaw/workspace`
  - query params:
    - `path` — optional relative directory inside the workspace root
    - `depth` — optional positive integer, default `2`, maximum `5`
    - `limit` — optional positive integer, default `200`, maximum `500`
- `GET /api/sandboxes/:sandbox_id/workspace/file`
  - returns metadata plus inline-safe content for one relative workspace path
  - text-like formats may include `content`
  - binary or oversized formats return metadata only
- `GET /api/sandboxes/:sandbox_id/workspace/file/download`
  - streams the raw file bytes back to the browser with a safe attachment filename

All three routes fail closed when the requested path escapes the workspace root or resolves to an unsupported target.

### Path Safety Rules

- Client-supplied paths are always treated as relative to `~/.openclaw/workspace`.
- Absolute paths, `..` traversal, empty segments, and NUL bytes are rejected.
- Directory listing requests are bounded by `depth` and `limit` so the first slice cannot recursively dump an unbounded container filesystem.
- Reads are file-only; directory reads return an error instead of inventing empty content.

### File And Artifact Classification

The first slice classifies files into preview behaviors:

- `text`
  - markdown, text, source code, JSON, YAML, HTML, CSS, JS/TS, shell, logs
  - returns inline text content when the file is within the safe text-size budget
- `image`
  - png, jpg, jpeg, gif, webp, svg
  - returns metadata plus a download/inline URL; the browser renders the image directly
- `pdf`
  - returns metadata and download URL only for the first slice
- `binary`
  - returns metadata and download URL only

Unknown extensions default to `binary` unless the backend can safely prove the content is UTF-8 text.

### UI Contract

- `TabChat.tsx` adds a `files` workspace tab alongside `terminal`, `browser`, and `thinking`.
- Files workspace state is scoped to the active sandbox and selected conversation. Switching sandbox or conversation clears the selected file and reloads the list.
- The Files tab shows:
  - a bounded file tree/list for the current workspace directory
  - a selected-file pane with metadata
  - inline text preview for `text`
  - inline image preview for `image`
  - metadata plus download action for `pdf` and `binary`
- Empty states explain that files appear when the sandbox workspace contains generated or modified outputs.

### First-Slice Scope Limits

The first slice does not attempt to ship:

- a full persistent editor with save/write-back mutations
- diff history or Git-aware file ownership
- PDF inline rendering
- a full artifact gallery independent of the Files workspace
- backend persistence of per-run file snapshots

## Implementation Notes

- The backend uses container-local Node scripts through `sandboxExec()` so listing, file metadata, and downloads run inside the sandbox without opening broader filesystem access.
- Shared preview/path helpers keep route behavior deterministic across list/read/download.
- The deployed-agent chat Files tab reuses the existing workspace shell instead of creating a separate page, so later terminal/artifact/research slices can compose into one workspace model.

## Test Plan

- Backend unit: path normalization and preview classification
- Backend e2e: workspace list/read/download routes enforce the sandbox workspace root and return the documented payloads
- Frontend e2e: mocked deployed-chat APIs show the Files workspace tab, file selection, inline preview, and download affordance
