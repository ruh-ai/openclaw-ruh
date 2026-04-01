# LEARNING: Builder channel choices need one saved agent contract

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-channel-persistence]]

## Date

2026-03-27

## Context

The builder already had a real Channels step, Co-Pilot review copy, Improve Agent seed logic, and deploy surfaces that implied messaging-channel choices mattered. But the actual saved-agent contract dropped that state, so the operator saw a meaningful selection in-session and then lost it immediately on save or reopen.

## What Changed

- Added persisted `channels[]` metadata to the backend `agents` record and both create/update/config route validators.
- Threaded `channels[]` through the frontend saved-agent store, draft save path, Improve Agent reopen seed, and create/deploy completion handlers.
- Kept runtime truthfulness by treating builder-selected channels as plan metadata only; deploy handoff now tells the operator to finish channel credentials and pairing after deploy rather than implying Slack or Telegram is already configured.

## Why It Matters

UI-only configuration steps become false affordances if they do not survive the first persistence boundary. For builder-selected channels, the durable contract belongs on the saved agent as safe metadata, while secret material stays on the existing runtime channel setup surfaces.

## Related Notes

- [[008-agent-builder-ui]] — builder Channels flow and deploy handoff now read one persisted contract
- [[004-api-reference]] — agent CRUD/config routes now accept and return `channels[]`
- [[005-data-models]] — `agents.channels` stores the safe messaging-channel plan
- [[011-key-flows]] — create and Improve Agent now preserve planned messaging channels
