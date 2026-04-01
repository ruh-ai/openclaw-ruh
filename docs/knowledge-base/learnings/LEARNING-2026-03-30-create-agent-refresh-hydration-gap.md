# LEARNING: `/agents/create` refreshes need backend hydration plus safe local resume state

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-create-session-resume]]

## Date

2026-03-30

## Context

The create flow already autosaved safe draft metadata through the backend, but a hard refresh on `/agents/create?agentId=...` could still reopen blank or disconnected. The route trusted transient in-memory Zustand state too much, and draft autosave could fail on the first resumed write because the local agent list was cold after reload.

## What Happened

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` restored only a thin lifecycle cache and did not always re-fetch the route agent from the backend before rebuilding the page state.
- The builder route therefore lost forge linkage and safe in-progress work on refresh unless the exact agent snapshot happened to still be present in local Zustand memory.
- `saveAgentDraft()` also assumed the target agent already existed in the local store, which is false immediately after a refresh.

## Resolution

- Route entry now always re-fetches the backend agent record for `/agents/create?agentId=...`.
- The page writes and restores a local safe create-session cache keyed by `agentId` so non-secret in-progress state survives refresh even before every field is durably saved.
- `saveAgentDraft()` now fetches the backend agent first when the local store is cold instead of failing the resumed autosave loop.

## Reusable Rule

For builder-style routes, use the backend record as the authoritative persisted baseline and treat browser storage as a safe overlay for in-progress non-secret state only. Do not make resumed autosave depend on a warm in-memory store.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-create-session-resume]]
