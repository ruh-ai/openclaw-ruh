# LEARNING: Deployed-agent chat still lacks an in-product editor iteration loop

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The active `docs/project-focus.md` is now represented in `TODOS.md` across the main deployed-chat parity slices: browser visibility, files/artifacts, terminal/process state, connector-aware research, productization, persistent workspace memory, and code-control handoff. The next analyst decision therefore needed to find the strongest remaining operator-value gap inside that existing workspace journey rather than invent another top-level category.

## What Was Learned

The highest-value remaining focus-aligned package is the in-product editor iteration loop on `/agents/[id]/chat`, not another standalone workspace surface.

Current local evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/FilesPanel.tsx` is still a read-only inspector. It lists session files, previews the selected file, and offers download, but there is no editable text surface, dirty-state model, save control, or diff visibility.
- `agent-builder-ui/lib/openclaw/files-workspace.ts` and `ruh-backend/src/app.ts` expose bounded list/read/download helpers and routes only. There is no backend contract for workspace-root write-back mutations.
- `docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md` explicitly leaves persistent editor write-back plus diff/revision history out of scope for the shipped files/artifacts slice.
- TASK-2026-03-25-86 scopes export and ownership handoff, and TASK-2026-03-25-83 scopes preview/productization visibility, but neither creates the in-product edit-and-validate loop that operators need before export or publish.
- The Manus baseline in `docs/project-focus.md` explicitly includes editor parity, diffs, and live preview, and repo search showed no active or deferred TODO that already packages those capabilities for deployed chat.

## Evidence

- `docs/project-focus.md` lists code/editor parity as a desired outcome, including file viewer/editor, diffs, side-by-side preview, and an explicit path from agent output to operator ownership.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/FilesPanel.tsx` renders preview-only workspace content with no save or diff affordance.
- `ruh-backend/src/app.ts` only defines `GET /api/sandboxes/:sandbox_id/workspace/files`, `GET /api/sandboxes/:sandbox_id/workspace/file`, and `GET /api/sandboxes/:sandbox_id/workspace/file/download` for the deployed-chat workspace.
- `docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md` names `a full persistent editor with save/write-back mutations` and `diff history or Git-aware file ownership` as out of scope for the shipped first slice.
- `rg` over `TODOS.md`, `docs/knowledge-base`, and the deployed-chat code found browser/files/terminal/research/productization/workspace-memory/export coverage but no worker-ready package for bounded edit/write-back plus preview-coupled validation.

## Implications For Future Agents

- Treat the next deployed-chat code/editor package as a bounded inline editor plus preview-coupled validation loop on top of the existing Files workspace.
- Do not duplicate TASK-2026-03-25-78 or TASK-2026-03-25-86. The missing capability is not basic preview or export; it is the operator-visible ability to make and validate one bounded edit before handoff.
- Keep the first slice narrow: editable text/code files only, deterministic dirty-state and save rules, explicit unsupported states, and a simple before/current diff summary are enough without full Git sync or durable revision history.
- Compose this work with terminal file navigation, preview/productization metadata, and code-control handoff so the deployed-agent page behaves like one operator loop instead of separate preview and export islands.

## Links

- [[011-key-flows]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-25.md)
