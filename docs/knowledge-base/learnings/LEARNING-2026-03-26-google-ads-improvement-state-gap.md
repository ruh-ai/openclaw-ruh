# LEARNING: The Google Ads improvement loop still has no persisted state contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run re-checked the active Google Ads creation-focus lane after the repo had already shipped structured `toolConnections[]`, secure credential summaries, structured `triggers[]`, AG-UI draft autosave, and the first review/deploy truthfulness follow-up package. The goal was to identify the single highest-value missing feature package that still was not represented as a worker-ready entry in `TODOS.md`.

## What Was Learned

The focus lane still lacks a first-class persistence contract for builder-surfaced improvement recommendations.

- `docs/project-focus.md` says the builder should surface concrete process improvements and feed approved improvements back into persisted agent config, but the saved agent model and active worker-ready tasks only cover skills, rules, tool connections, triggers, and operator-facing summary truthfulness.
- `SavedAgent`, `AgentRecord`, `CoPilotState`, and the AG-UI builder metadata pipeline have no field for structured recommendations or operator acceptance state, so any improvement advice can only live in transient chat content.
- Without a persisted recommendation model, Improve Agent, Review, refresh, and Deploy cannot reliably show which optimizations were proposed, accepted, deferred, or already applied to the saved Google Ads agent.

## Evidence

- `agent-builder-ui/lib/openclaw/copilot-state.ts` stores `connectedTools`, `triggers`, `agentRules`, and builder identity metadata, but no recommendation or acceptance state.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` and `wizard-directive-parser.ts` normalize fields for skills/tools/triggers/rules only.
- `agent-builder-ui/hooks/use-agents-store.ts` and `ruh-backend/src/agentStore.ts` persist `toolConnections[]`, `triggers[]`, and `workspace_memory`, but no improvement or recommendation field.
- `agent-builder-ui/e2e/create-agent.spec.ts` covers Google Ads save/reload for tools and triggers, but no accepted-improvement persistence path.

## Implications For Future Agents

- Treat the persisted improvement loop as a separate contract gap, not as something already solved by the saved tool/trigger metadata or by review/deploy summary work.
- Do not add more Google Ads “builder advice” UI that exists only in transient chat prose; the first follow-on slice should make at least one recommendation category durable across save, reopen, and deploy.
- Keep the saved recommendation contract metadata-only and safe for normal read APIs, just like the shipped connector and trigger models.

## Links

- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
