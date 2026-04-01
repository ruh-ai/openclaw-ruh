# LEARNING: Deployed-agent chat has no files or artifact workspace contract yet

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The active `docs/project-focus.md` says the deployed-agent chat page should move from browser visibility + takeover to `Files/editor + artifact preview` as the next Manus-style parity slice. A grounded review of the current deployed-chat implementation showed that this second slice is still completely missing from both the UI and the backend contract.

## What Was Learned

The next focus-aligned parity package should be framed as a files/editor plus artifact-workspace contract on `/agents/[id]/chat`, not as vague editor polish and not as a backend-only file-read primitive.

Current repo evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` still hardcodes the workspace tabs to `terminal` and `thinking` only, with no file tree, selected path state, preview panel, or artifact-specific UI.
- That same file parses streamed text and tool calls into reasoning and terminal-style steps, so file paths or generated outputs currently surface only as prose or command snippets rather than first-class workspace state.
- `ruh-backend/src/app.ts` does not expose a deployed-chat route for listing workspace files, reading file contents, or serving generated artifact metadata/downloads under a safe sandbox-root contract.
- Repo-wide searches found no existing deployed-chat component or backend helper that already provides file/artifact workspace behavior for the operator.
- The focus document explicitly groups `files/editor + artifact preview` as the next suggested delivery slice after browser work, which makes this gap both current and priority-ordered rather than speculative.

## Evidence

- `docs/project-focus.md` lists `Files/editor + artifact preview` as the second suggested delivery slice for the deployed-agent chat parity effort.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sets `useState<"terminal" | "thinking">("terminal")` in `ComputerView`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` has reasoning/tool parsing and markdown/code-block extraction, but no file/artifact-specific state model.
- `ruh-backend/src/app.ts` includes deployed-chat proxying plus configure-agent writes into `.openclaw/workspace`, but no operator-facing file list/read/download routes for that workspace.

## Implications For Future Agents

- Treat the next parity slice as one files/editor plus artifact workspace contract so generated code/assets and previewable outputs land on the same operator surface.
- Reuse the existing deployed-chat workspace panel in `TabChat.tsx` instead of creating a disconnected files page for the first slice.
- Define a bounded backend read contract early: safe workspace-root file listing, text-file reads, preview classification, and downloads should be canonical before richer editor/diff/gallery work lands.
- Keep the first slice visibly useful: a touched-files view, inline text inspection or light editing, and preview/download support for common generated artifacts is a stronger starting point than hidden filesystem plumbing with no operator surface.

## Links
- [[004-api-reference]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-25.md)
