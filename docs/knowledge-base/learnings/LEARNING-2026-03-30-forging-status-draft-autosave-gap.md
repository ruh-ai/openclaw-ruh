# LEARNING: Forge-backed draft autosave must preserve `forging` status

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-create-session-resume]]

## Date

2026-03-30

## Context

The create flow already resumed saved forge-backed agents on `/agents/create?agentId=...`, and `saveAgentDraft()` intentionally preserved the agent's existing status while writing safe builder metadata. Agents created through `POST /api/agents/create` stay in `forging` until the forge/deploy lifecycle advances, so resumed autosave metadata patches can legitimately carry `status: "forging"`.

## What Happened

- The frontend autosave path called `PATCH /api/agents/:id` with the existing metadata status untouched.
- Forge-backed create-flow agents therefore sent `status: "forging"` during ordinary draft autosave.
- Backend metadata validation still only allowed `active` and `draft`, so the request failed with `422 status must be one of: active, draft` and the UI surfaced `Draft save failed`.

## Resolution

- `validateAgentMetadataPatchBody()` now accepts `forging` alongside `active` and `draft`.
- The existing frontend autosave/store contract can therefore preserve forge-backed status truthfully instead of inventing a fake state transition just to make metadata persistence pass.

## Reusable Rule

If a frontend route persists metadata for an entity whose lifecycle already includes intermediate persisted states, backend patch validators must accept those truthful persisted states or the autosave/resume loop will fail even when no real state transition is being requested.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-create-session-resume]]
