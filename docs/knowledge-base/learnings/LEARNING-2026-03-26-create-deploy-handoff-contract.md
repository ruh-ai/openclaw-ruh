# LEARNING: First deploy must reuse the saved draft id and finalized connector state

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-create-deploy-handoff]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

Worker-1 implemented TASK-2026-03-26-119 after the repo had already shipped draft autosave, persisted tool/trigger metadata, and first-save credential storage for the Google Ads create lane.

## What Was Learned

The real handoff boundary is not just a route change. The autosaved-draft path must finalize the same pending credential-backed connector state as the brand-new save path before the deploy page renders, or the first deploy opens against stale readiness metadata.

- A draft-backed create session can already have an `agentId`, so branching only on “saved vs unsaved” misses the first-save connector finalize step.
- The deploy page can safely auto-start only when the saved config summary is already ready; otherwise the create-source route should still open the deploy page but stay blocked and visible.
- Improve Agent remains a distinct contract. Reusing the first-deploy handoff for existing agents would incorrectly bypass hot-push behavior and blur operator expectations.

## Implications For Future Agents

- Treat “new create flow” as “not editing an existing agent”, not as “agent id does not exist yet”.
- Any future deploy-readiness or connector changes must keep the create-to-deploy handoff reading the same finalized saved `toolConnections[]` and `triggers[]` metadata that Review just showed.
- Browser regressions for `/agents/create` should assert the deploy route handoff directly, not only that an agent record was saved.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-create-deploy-handoff]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
