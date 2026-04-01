# LEARNING: Deployed-agent chat still lacks a code-control handoff workflow

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The active `docs/project-focus.md` is now fully represented in `TODOS.md` at the coarse feature-slice level: browser, files/artifacts, terminal/process, research, productization, and persistent workspace memory all have dedicated feature packages. The next analyst decision therefore needed to find the strongest remaining operator-value gap inside that focus rather than adding another top-level category.

## What Was Learned

The highest-value missing package inside the active deployed-chat focus is code-control handoff, not another generic workspace surface.

Current local evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/FilesPanel.tsx` is still a read-only inspector for recent files. It lists files, previews selected content, and downloads one file at a time, but it does not provide a "take ownership of this generated code" workflow.
- `docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md` explicitly leaves full editor write-back, diff history, and Git-aware ownership out of scope for the shipped files/artifacts slice.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` and `TabMissionControl.tsx` still expose no code export, handoff summary, revision summary, or workspace-bundle action for the deployed-agent journey.
- `ruh-backend/src/app.ts` and `ruh-backend/src/workspaceFiles.ts` expose bounded list/read/download routes only. There is no bounded archive export or handoff metadata route for the deployed-chat workspace.
- The Manus baseline captured in `docs/project-focus.md` explicitly includes direct code copy and full codebase download/export, and repo search showed no active or deferred TODO entry covering that deployed-chat capability.

## Evidence

- `docs/project-focus.md` lists code use and editor parity as a desired outcome, including file ownership, code export/download, and an explicit path from agent output to code ownership.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/FilesPanel.tsx` renders workspace file previews plus a single-file download button only.
- `docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md` names `a full persistent editor with save/write-back mutations`, `diff history or Git-aware file ownership`, and other richer code-control work as out of scope for the first shipped Files slice.
- `rg` over `TODOS.md` and `docs/knowledge-base` found browser/files/terminal/research/productization/workspace-memory packages but no deployed-chat code-control handoff package.

## Implications For Future Agents

- Treat the next deployed-chat parity package as a code-control handoff workflow that helps operators take ownership of generated code from `/agents/[id]/chat`.
- Do not duplicate TASK-2026-03-25-78. The missing capability is not basic file preview; it is the operator-visible export and ownership path layered on top of the Files workspace.
- Keep the first slice bounded: workspace handoff summary, safe workspace archive export, and clear copy/download actions are enough without trying to ship full write-back editing or Git synchronization immediately.
- Compose this work with existing files, terminal, productization, and workspace-memory surfaces so the deployed-agent page feels like one operator journey rather than separate unrelated tools.

## Links

- [[011-key-flows]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-25.md)
