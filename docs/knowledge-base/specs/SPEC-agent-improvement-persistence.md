# SPEC: Agent Improvement Persistence

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[005-data-models]]

## Status

implemented

## Summary

The Google Ads proving-case flow needs builder-surfaced process improvements to become durable product state, not transient chat prose. This slice adds one metadata-only `improvements[]` contract that survives draft autosave, save, Improve Agent reopen, and deploy summaries while staying safe for normal agent read APIs.

## Related Notes

- [[005-data-models]] — the saved `agents` record gains one authoritative `improvements` JSON field
- [[008-agent-builder-ui]] — AG-UI builder metadata, Co-Pilot review, and Improve Agent review surfaces consume and persist the same improvement state
- [[011-key-flows]] — the create/improve/deploy journey now preserves accepted recommendations across save and reopen
- [[SPEC-google-ads-agent-creation-loop]] — this extends the Google Ads proving case with one accepted-improvement loop

## Specification

### Goal

Ship one bounded recommendation-persistence slice that:
- emits at least one structured builder recommendation from AG-UI-ready metadata without transcript scraping
- lets the operator accept or dismiss that recommendation from review
- persists the recommendation and decision in saved agent state
- rehydrates the decision on Improve Agent reopen and exposes accepted items on deploy

### Saved Improvement Contract

Saved agents may now store `improvements[]` entries with:
- `id`
- `kind` (`tool_connection`, `trigger`, `workflow`)
- `status` (`pending`, `accepted`, `dismissed`)
- `scope` (`builder`)
- `title`
- `summary`
- `rationale`
- optional `targetId`

Rules:
- The field is metadata-only. It must not store raw credentials, bearer tokens, free-form transcript excerpts, or prompt text.
- Reads and writes use the same field across draft autosave, full save, config patch, agent fetch, Improve Agent, and deploy summary surfaces.
- Unknown keys or unsupported enum values fail closed in backend validation.

### First Shipped Recommendation Category

The first shipped Google Ads slice derives one builder recommendation from structured builder metadata:
- If the generated builder metadata indicates Google Ads tool usage and the saved agent does not yet have a configured Google Ads connection, emit a `tool_connection` recommendation encouraging the operator to connect Google Ads before deploy.

This recommendation is derived from canonical builder metadata (`toolConnectionHints[]`, current saved tool state), not from assistant transcript text.

### Operator Decision Flow

- Review surfaces show current improvements with `Accept` and `Dismiss` actions.
- Accepting the shipped Google Ads `tool_connection` recommendation must also project a truthful config change into saved/session `toolConnections[]` instead of leaving the decision as metadata-only.
- The first projected connector uses the same truthful `google` identity as the Connect Tools catalog and lands as `missing_secret` until credentials are actually stored; stronger saved states such as `configured` must win over the projection.
- Accepted items remain visible after save and Improve Agent reopen.
- Dismissed items remain recorded so the builder does not silently reintroduce them as if no decision exists.
- Deploy shows accepted improvements as part of the saved agent summary so the operator can understand which builder guidance was already adopted.

## Implementation Notes

- Backend persistence uses a new ordered schema migration adding `agents.improvements JSONB NOT NULL DEFAULT '[]'::jsonb`.
- Validation accepts `improvements` on create and config patch payloads and enforces a metadata-only strict shape.
- Frontend state extends `SavedAgent`, draft autosave payloads, builder metadata state, builder state, and Co-Pilot state with the same `improvements[]` field.
- AG-UI recommendation derivation preserves existing operator decisions by `id` when the builder emits the same recommendation again.
- `create-session-config.ts` owns the first bounded improvement projector so review, Co-Pilot, reopen, and autosave all derive the same projected connector state from accepted improvements.

## Test Plan

- `ruh-backend/tests/unit/validation.test.ts`
- `ruh-backend/tests/unit/agentStore.test.ts`
- `agent-builder-ui/hooks/use-agents-store.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-metadata-autosave.test.ts`

Manual/operator verification:
- Build or reopen a Google Ads agent in `/agents/create`
- Review the builder recommendation to connect Google Ads before deploy
- Accept it, save the agent, reopen Improve Agent, and confirm the accepted improvement remains visible
- Open deploy and confirm accepted improvements are summarized from saved state

## Related Learnings

- [[LEARNING-2026-03-27-trigger-improvement-projection-gap]] — the saved improvement contract already allows `trigger` and `workflow`, but the live derivation/projector path still only turns accepted connector advice into real config state
- [[LEARNING-2026-03-27-workflow-improvement-projection-gap]] — even after trigger-specific follow-on work was split out, accepted `workflow` improvements still do not project into saved `workflow` or `agentRules` state
