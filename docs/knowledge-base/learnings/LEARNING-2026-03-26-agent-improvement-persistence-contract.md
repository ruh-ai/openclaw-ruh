# LEARNING: Persist builder recommendations as metadata, not chat prose

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

Worker-1 completed the first Google Ads improvement-persistence slice after the repo had already shipped saved `toolConnections[]`, `triggers[]`, and AG-UI draft autosave. The missing seam was not recommendation generation itself, but the lack of a durable saved-agent contract for operator decisions about those recommendations.

## What Was Learned

Builder recommendations stay composable only when they are persisted as metadata alongside the rest of the saved agent contract.

- A dedicated `improvements[]` field on the saved agent record is simpler and safer than trying to infer accepted builder guidance from review text, deploy summaries, or historical chat messages.
- The AG-UI layer can derive the first recommendation category from structured builder metadata (`toolConnectionHints[]`) instead of transcript scraping, which keeps the recommendation loop deterministic and testable.
- Review and deploy surfaces should read the same saved `improvements[]` state; they should not each invent their own local recommendation summaries.

## Evidence

- `ruh-backend/src/validation.ts` now accepts metadata-only `improvements[]` payloads on create/config routes and rejects unknown keys inside each entry.
- `ruh-backend/src/agentStore.ts` and `ruh-backend/src/schemaMigrations.ts` now persist `agents.improvements` as JSONB and normalize it on read.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` now derives the Google Ads connector recommendation from structured builder metadata and preserves operator decisions by recommendation id.
- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`, `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`, and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` now all consume the same saved improvement state.

## Implications For Future Agents

- Extend recommendation coverage by adding new `kind` values or new recommendation ids under the same `improvements[]` field instead of storing builder advice in chat content or per-surface local state.
- Preserve operator choices by stable recommendation id whenever the builder re-derives a known recommendation.
- When follow-on work updates review, Improve Agent, or deploy truthfulness, read from saved `improvements[]` first and only fall back to builder derivation for unsaved drafts.

## Links

- [[005-data-models]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-improvement-persistence]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
