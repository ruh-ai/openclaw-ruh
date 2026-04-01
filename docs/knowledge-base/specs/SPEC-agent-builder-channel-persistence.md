# SPEC: Agent Builder Channel Persistence

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

`/agents/create` already asks operators which communication channels an agent should use, but that choice was only in-memory UI state. This slice makes `channels[]` a persisted agent contract so save, deploy handoff, and Improve Agent reopen all show the same planned channel state without pretending credentials are already configured.

## Related Notes

- [[004-api-reference]] — create, metadata patch, config patch, and agent read routes now round-trip `channels[]`
- [[005-data-models]] — the `agents` record now stores persisted builder-selected `channels` metadata
- [[008-agent-builder-ui]] — create, review/config, and deploy surfaces consume the same saved channel contract
- [[011-key-flows]] — the Google Ads builder journey now preserves planned channels through save and reopen
- [[SPEC-google-ads-agent-creation-loop]] — extends the persisted create-flow contract so channels stop being decorative

## Specification

### Channel Contract

Saved agents may now store `channels[]` entries with:

- `kind` (`telegram`, `slack`, `discord`)
- `status` (`planned`, `configured`, `unsupported`)
- `label`
- `description`

Rules:

- Builder-selected channels are metadata only. Raw Slack, Telegram, or Discord secrets must remain in the existing runtime channel setup surfaces and must not be returned from normal agent read APIs.
- New create/improve flows persist selected channels as `planned` unless another trusted runtime surface later upgrades that status.
- Existing agents with no stored channel metadata must continue to read as `[]`.

### API Contract

- `POST /api/agents` accepts optional `channels[]` and persists it on create.
- `PATCH /api/agents/:id` accepts optional `channels[]` alongside metadata fields so save/reopen flows can update selections without abusing config-only routes.
- `PATCH /api/agents/:id/config` also accepts optional `channels[]` so draft/config-oriented persistence paths can update the same contract.
- `GET /api/agents` and `GET /api/agents/:id` return the persisted `channels[]` array on every agent record.

### UI Contract

- The default Co-Pilot Channels step writes into the same persisted `channels[]` contract used by saved agents.
- Improve Agent reopen seeds channel selections from saved `channels[]`.
- Review/config/deploy surfaces must show persisted channel state, not only the latest in-memory selection.
- Deploy handoff must keep selected channels visible as `planned` or `configured` and give the operator a clear follow-up message that runtime bot credentials are configured after deploy, not during builder save.

## Implementation Notes

- Backend persistence adds `agents.channels` as JSONB with an empty-array default through the schema migration ledger.
- Frontend store mapping must hydrate `SavedAgent.channels` from `channels` on backend responses and include that field in create, update, draft-save, and config-patch payloads.
- Review/deploy summaries should stay truthful: selected messaging channels are part of the saved plan even when the runtime still needs setup.
- [[LEARNING-2026-03-28-copilot-channel-draft-persistence-gap]] — the saved-agent channel contract shipped, but AG-UI Co-Pilot draft autosave still needs a follow-on slice so live channel edits are present before final completion.

## Test Plan

- Backend validation tests for `channels[]` acceptance and rejection paths
- Backend store + CRUD integration coverage proving `channels[]` round-trips and defaults safely
- Frontend store tests proving `fromBackend()`, draft save, and improve-agent reopen preserve channels
- Focused create-flow regression proving selected channels survive save and deploy handoff summaries

## Related Learnings

- [[LEARNING-2026-03-28-copilot-channel-draft-persistence-gap]] — draft autosave currently omits live channel selections even though the underlying saved-agent and config-patch contracts already support `channels[]`
