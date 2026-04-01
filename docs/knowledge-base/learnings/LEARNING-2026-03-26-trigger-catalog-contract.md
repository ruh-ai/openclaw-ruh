# LEARNING: Trigger selection should normalize through one runtime-backed catalog

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-webhook-trigger-runtime]] | [[013-agent-learning-system]]

## Context

Worker follow-through on TASK-2026-03-26-125 replaced the create-flow trigger picker's hard-coded support list and default `chat-command` fallback with one shared trigger catalog tied to the shipped runtime contract.

## What Was Learned

The durable seam is not just "which cards are visible" but "which trigger ids normalize into truthful saved metadata." The same helper should decide:

- which trigger cards are deployable today
- which cards are visible only as manual-plan ideas
- how AI/default suggestions are derived
- how reopened legacy selections such as `chat-command` are normalized back onto truthful `supported` vs `unsupported` status

Keeping that normalization in one helper prevents the UI, save/reopen flow, and deploy-time cron generation from drifting back into separate trigger-truth models.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/trigger-catalog.ts` now marks only `cron-schedule` as supported, keeps `webhook-post` as manual-plan, and removes the old `chat-command` fallback suggestion.
- `StepSetTriggers.tsx` reads the shared catalog for card status, selection toggles, suggestion behavior, and summary text instead of maintaining its own `SUPPORTED_TRIGGER_IDS`.
- `trigger-catalog.test.ts` proves the helper normalizes a legacy saved `chat-command` selection back to `unsupported` on reopen.

## Implications For Future Agents

- Extend trigger support by editing the shared catalog/helper first, then wiring runtime and deploy/readiness work to the same status contract.
- Do not reintroduce local `Set([...supported ids])` lists in the picker, review, or deploy UI.
- When webhook runtime lands, flip the catalog in tandem with backend/runtime support so saved selections and operator-facing status change together.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [Journal entry](../../journal/2026-03-26.md)
