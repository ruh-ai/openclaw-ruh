# LEARNING: `/agents/create` autosaves drafts but still lacks route-entry recovery and clean-session reset

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-copilot-config-workspace]] | [[SPEC-agui-protocol-adoption]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run reviewed the active Google Ads create-flow lane after AG-UI live draft autosave, saved config truthfulness, and persisted improvement metadata had already shipped. The goal was to find the highest-value missing feature package that was still not represented in `TODOS.md`.

## What Was Learned

The builder now saves safe draft metadata early, but `/agents/create` still has no explicit contract for what should happen when the operator refreshes, leaves, or starts a new create session.

- `page.tsx` resets `builderState` when there is no `editingAgentId`, which drops `draftAgentId` and the route's only link to the autosaved draft record.
- The page does not reset or seed the global `useCoPilotStore()` singleton on route entry, so a supposedly fresh `/agents/create` session can inherit stale purpose, skills, tools, triggers, or improvements from the last run.
- `CoPilotLayout.tsx` immediately mirrors the singleton store's `name` and `description` back into builder state and uses those values in the live shell, which turns that stale singleton state into visible new-session state.
- The repo already has `saveAgentDraft()` and persisted draft records, but it has no route-level resume-or-start-fresh policy, so autosave exists without a continuation UX or deterministic recovery rule.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` calls `resetBuilderState()` in the mount effect whenever there is no `editingAgentId`.
- The same file never calls `useCoPilotStore().reset()` or any equivalent seeding helper when entering a new create session.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` writes `name` and `description` from the Co-Pilot store back into `onBuilderStateChange(...)`.
- `agent-builder-ui/hooks/use-agents-store.ts` persists drafts through `saveAgentDraft()`, but there is no helper for selecting the most relevant draft to resume on `/agents/create`.
- `agent-builder-ui/app/(platform)/agents/page.tsx` routes the main create CTA directly to `/agents/create` without checking for or surfacing resumable drafts.

## Implications For Future Agents

- Treat autosaved draft creation as incomplete until the route-entry behavior is explicit: resume the saved draft intentionally or start fresh with both stores cleared.
- Do not assume page-local `builderState` alone owns create-session truth; the Co-Pilot singleton must be reset or seeded in lockstep with it.
- Future Google Ads create-flow, AG-UI, and timeout-recovery work should build on one coherent draft-session lifecycle instead of adding more logic to a split reset/resume model.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-copilot-config-workspace]]
- [[SPEC-agui-protocol-adoption]]
- [Journal entry](../../journal/2026-03-26.md)
