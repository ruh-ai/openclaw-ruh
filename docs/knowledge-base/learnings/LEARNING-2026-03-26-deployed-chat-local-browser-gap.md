# LEARNING: Deployed-chat browser parity still lacks local operator handoff

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The active `docs/project-focus.md` keeps Manus-style deployed-agent workspace parity focused on the chat page, and its browser section explicitly includes cloud-vs-local browser mode, auth/session prompts, and real logged-in operator handoff. After the first browser workspace slice shipped, the repo needed a fresh pass to see which browser capability gap remained highest-value and still untracked.

## What Was Learned

The next meaningful browser-parity gap is no longer visibility. It is local-browser/operator handoff for auth-bound or session-bound tasks.

Current repo evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx` only supports `live`, `activity`, and `preview` modes, which all assume sandbox-hosted browser output rather than an operator-owned logged-in browser session.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/LiveBrowserView.tsx` is screenshot polling only; it does not accept user input, represent browser-mode transitions, or launch a local browser/operator path.
- `agent-builder-ui/lib/openclaw/browser-workspace.ts` only models `navigation`, `action`, `screenshot`, `preview`, `takeover_requested`, and `takeover_resumed`, so there is no structured contract for auth-needed prompts, local-browser attach metadata, or mode persistence.
- `docs/knowledge-base/specs/SPEC-deployed-chat-browser-workspace.md` deliberately scoped the first shipped browser slice to timeline/preview/takeover and left live operator control and broader browser persistence out of scope.
- `TODOS.md` already captures files/editor, terminal/process, research, productization, workspace memory, code-control, and editor iteration, but it did not yet include any feature package for local-browser handoff.

## Evidence

- `docs/project-focus.md` lists `local-browser/operator mode for real logged-in sessions`, `auth/session prompts`, and `cloud-vs-local browser mode` as part of the active parity goal.
- `TASK-2026-03-25-77` is complete and covers only browser timeline plus takeover visibility, not local operator browser mode.
- The Browser tab code path is still entirely deploy-page-local UI state; no backend or browser-workspace contract today can truthfully tell the operator whether a local-browser path exists.

## Implications For Future Agents

- Do not treat the current browser workspace as sufficient for logged-in web tasks just because the page shows screenshots, previews, or a takeover banner.
- Scope the next browser package around bounded local-browser/auth handoff state instead of broad replay or full remote control.
- Extend the existing Browser workspace contract rather than inventing a second browser surface outside `/agents/[id]/chat`.
- Keep the first slice browser-safe: capability metadata, launch/attach instructions, auth-needed checkpoints, and resume state are in scope; arbitrary host-browser control is not.

## Links
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-deployed-chat-browser-workspace]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-26.md)
