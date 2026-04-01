# LEARNING: Deployed chat productization surface gap

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]]

## Context

`docs/project-focus.md` keeps the deployed-agent chat page as the active Manus-style parity target and sequences the remaining work after browser, files/artifacts, terminal/process state, and connector-aware research. This run re-checked the current TODO coverage, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, and the backend/API surface in `ruh-backend/src/app.ts` plus `docs/knowledge-base/004-api-reference.md`.

## What Was Learned

The next credible parity gap after the research workspace is not persistent memory yet; it is an operator-facing productization surface on `/agents/[id]/chat`. The repo already has visible packages for browser, files/artifacts, richer terminal/process state, and connector-aware research, but the deployed-agent journey still stops short of letting an operator answer basic product questions from the same page:

- Is there a previewable app or output URL for this sandbox?
- Is the thing merely deployed, actually publishable, or already published?
- Is any end-user auth/access-control layer configured?
- Are there bounded analytics or app/data resources the operator can inspect next?

Today `TabMissionControl.tsx` is still a sandbox-ops/status panel, not a productization workflow. The backend and documented API also expose no bounded contract for preview, publish status, access readiness, analytics, or data-resource visibility.

## Evidence

- `docs/project-focus.md` explicitly orders `Publish/auth/analytics/data operator surfaces` before `Persistent project/workspace memory polish`.
- `TODOS.md` already covers the earlier parity slices with TASK-2026-03-25-77, TASK-2026-03-25-78, TASK-2026-03-25-80, and TASK-2026-03-25-82, but no active or deferred entry describes a productization/operator surface.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` still exposes only `chat`, `chats`, `mission`, and `settings` as top-level operator views.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` fetches sandbox status and conversation count, then renders skills, env-var hints, and quick actions only.
- `ruh-backend/src/app.ts` and `docs/knowledge-base/004-api-reference.md` contain no deployed-agent route contract for preview URLs, publish state, analytics summaries, access readiness, or app/data-resource inspection.

## Implications For Future Agents

- Treat productization as the next high-value parity package once the research slice is represented; do not jump straight to persistent workspace memory unless the operator focus changes or productization work becomes sufficiently covered.
- Keep the first productization slice bounded to safe read-only readiness and navigation states; full publish automation, end-user auth provisioning, and deep database tooling can layer on later.
- Reuse `TabMissionControl.tsx` or a closely related deployed-agent surface rather than inventing a separate unrelated dashboard, so the operator can move from chat output to preview/publish/access/analytics/data actions in one journey.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-25.md)
