# LEARNING: Deployed-agent chat still lacks a connector-aware research workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The active `docs/project-focus.md` now sequences Manus-style parity work on the deployed-agent chat page. Browser visibility, files/artifacts, and richer terminal/process state already have dedicated feature-package TODOs, so the next analyst decision needed to verify the next uncovered parity slice instead of duplicating those packages.

## What Was Learned

The next missing parity package is a connector-aware research workspace on `/agents/[id]/chat`, not another generic workspace tab and not a duplicate of the builder-side tool-connection setup work.

Current local evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` and `BrowserPanel.tsx` can show streamed chat, browser heuristics, and terminal-like steps, but they have no source cards, citation model, connector provenance, or final research-bundle surface.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` only loads sandboxes and tab state; it does not load connector readiness or run-scoped research metadata for operators.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx` shows connector setup intent in the builder flow, but that setup does not produce an operator-visible runtime workflow on the deployed-agent chat page.
- `agent-builder-ui/hooks/use-agents-store.ts` still models saved agents without connector metadata for the deployed-chat page, and `ruh-backend/src/app.ts` exposes no deployed-chat route or structured stream payload for source bundles or connector/tool provenance.
- Repo searches found no existing TODO entry that scopes the deployed-chat connector/research workflow itself. The nearby tasks cover browser, files/artifacts, terminal/process state, tool-connection persistence, and tool-secret storage, but not the operator-facing sourced-output workflow.

## Evidence

- `docs/project-focus.md` lists `Connector-aware workflows + research outputs` as the next suggested delivery slice after browser, files/artifacts, and terminal/process parity.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` currently tracks `browserItems` and terminal/thinking steps only.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx` renders screenshots, URLs, and a preview frame, but no source or connector provenance model.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx` contains builder-only connector affordances for Slack, Github, Jira, Notion, Linear, Google Workspace, and Zoho CRM.
- `TODOS.md` already contains TASK-2026-03-25-77, TASK-2026-03-25-78, and TASK-2026-03-25-80 for the first three parity slices, plus TASK-2026-03-25-02 and TASK-2026-03-25-20 for tool-connection persistence and secret safety.

## Implications For Future Agents

- Treat the next parity slice as a research workspace contract that makes sources, connector/tool provenance, and the final deliverable visible on `/agents/[id]/chat`.
- Do not scope this as “finish tool connections” or “add another generic tab.” The durable product gap is the missing operator-facing sourced-output workflow.
- Reuse TASK-2026-03-25-02 and TASK-2026-03-25-20 for connector metadata and safe secret handling, but keep the first research-workspace slice shippable even when some connectors are unavailable by rendering explicit unavailable states.
- Keep browser, files, terminal, and research outputs on one shared workspace model so later wide-research work does not splinter into unrelated surfaces.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-analyst-project-focus]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [Journal entry](../../journal/2026-03-25.md)
