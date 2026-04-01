# SPEC: Deployed Chat Code-Control Handoff

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

The deployed-agent chat page needs a first-class handoff workflow so operators can take ownership of generated code without reconstructing the workspace from chat prose or one-file-at-a-time downloads. This slice adds a bounded workspace handoff summary, selected-file copy/download actions for text/code files, and a safe workspace archive export rooted at the sandbox workspace.

## Related Notes

- [[004-api-reference]] — documents the handoff summary and archive export routes
- [[008-agent-builder-ui]] — owns the Files tab handoff summary, copy affordances, and export state
- [[011-key-flows]] — describes how operators move from an active deployed chat to taking code ownership
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — extends the existing read-only files workspace with a bounded export/handoff layer

## Specification

### Backend Contract

The first code-control slice adds two bounded read/export routes under one sandbox:

- `GET /api/sandboxes/:sandbox_id/workspace/handoff`
  - returns a summary of the current workspace that is safe to expose to an operator
  - includes bounded file counts, top-level folders, a shortlist of likely code files, and whether workspace archive export is allowed
  - returns explicit unavailable reasons when the workspace is empty, too large for archive export, or lacks exportable files
- `GET /api/sandboxes/:sandbox_id/workspace/archive`
  - returns a bounded `tar.gz` archive of the allowed workspace root only
  - fails closed when the workspace is empty, exceeds the bounded archive budget, or cannot be packaged safely

### Handoff Summary Expectations

The handoff payload should let the Files tab answer three operator questions without reading the transcript:

1. Is there code or generated project structure worth taking over?
2. Which paths are the most relevant starting points?
3. Can I export a bounded snapshot of the whole workspace right now?

The payload must not expose host filesystem paths, secrets, or arbitrary container locations.

### UI Contract

- The deployed-agent Files tab remains the home for file inspection and now also shows a code-control handoff section.
- Operators can:
  - review the workspace handoff summary
  - copy inline text/code previews from the selected file
  - download the selected file
  - export a workspace bundle when the backend marks it eligible
- Empty, unsupported, and over-budget states are explicit and explain why export is unavailable.

### First-Slice Scope Limits

This slice does not add:

- persistent write-back editing
- Git status, commit history, or push/sync
- revision diffs across runs
- arbitrary archive exports outside `~/.openclaw/workspace`

## Implementation Notes

- Reuse the existing workspace-root normalization helpers from `ruh-backend/src/workspaceFiles.ts`.
- Keep archive generation deterministic and bounded so browser clients do not trigger large, slow exports.
- The shipped UI scopes handoff/export to the active conversation session folder so the Files tab does not leak one run's ownership cues into another.
- The first shipped archive format is `tar.gz` generated inside the sandbox and streamed back through the backend with attachment headers.
- Compose the new handoff actions into `FilesPanel.tsx` rather than creating a parallel page or mission-control subsystem.

## Test Plan

- Backend route tests for handoff payload normalization, empty/oversize unavailable states, and archive response headers
- Workspace helper tests for safe route/url generation
- Deployed-chat browser coverage that proves the Files tab renders the handoff summary, copy/download controls, and export state from mocked APIs
