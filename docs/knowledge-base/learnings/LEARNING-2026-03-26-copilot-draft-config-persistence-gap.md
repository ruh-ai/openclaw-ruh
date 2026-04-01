# LEARNING: Co-Pilot draft autosave currently excludes live Configure selections

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

The active `docs/project-focus.md` still expects `/agents/create` to be iterative, MCP-first, and durable enough that an operator can return later without losing meaningful Google Ads configuration. The repo already shipped a visible Co-Pilot draft-save loop plus a separate route-entry recovery package, so this analyst run checked whether the saved draft record actually contains the same safe Configure state the operator sees before final deploy.

## What We Observed

- `agent-builder-ui/app/(platform)/agents/create/_components/AgentConfigPanel.tsx` shows `Saving draft…` and `Draft saved` in the default Co-Pilot shell, which implies the current in-progress builder state is durable.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` still builds draft payloads from builder metadata plus the last saved agent snapshot. Its normalized payload falls back to `agent?.toolConnections ?? []` and `agent?.triggers ?? []`, and it does not ingest the live Co-Pilot `selectedSkillIds`, `connectedTools`, or `triggers`.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` only persists those live Co-Pilot Configure choices inside `handleCoPilotComplete()`, which means they are not written when the draft-save badge turns green earlier in the flow.
- TASK-2026-03-26-117 already scopes route-entry resume-vs-fresh behavior, but that task can only restore truthful Configure state if the saved draft record itself includes the latest safe selections.

## Why It Matters

- A resumed or reopened draft can currently look stale even though the UI previously said `Draft saved`, which weakens operator trust in the Google Ads create loop.
- The active focus explicitly says that choices made in Choose Skills, Connect Tools, and Set Triggers should shape persisted agent state, so draft autosave cannot stop at builder metadata alone.
- Future AG-UI snapshot work should not entrench the current mismatch by migrating only builder metadata while leaving Configure selections on a separate unsaved path.

## Reusable Guidance

- Treat the Co-Pilot draft badge as a contract: if the shell says `Draft saved`, the latest safe selected skills, tool metadata, and trigger metadata should already be in the backend draft.
- Keep credential drafts and raw secret inputs ephemeral even when safe connector readiness metadata is autosaved.
- Separate the two concerns clearly in backlog planning:
  - route-entry recovery decides how `/agents/create` resumes or discards a draft
  - draft-content persistence decides what that resumed draft actually contains

## Related Notes

- [[008-agent-builder-ui]] — documents the default Co-Pilot shell and draft-save behavior that currently overstates what is durable
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case requires persisted Configure choices, not just chat metadata
- [[LEARNING-2026-03-26-create-draft-recovery-gap]] — route-entry draft recovery is a separate but dependent follow-up for the same create-session lifecycle
