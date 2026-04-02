# SPEC: Ruh App Runtime Recovery

[[000-INDEX|← Index]] | [[018-ruh-app]]

## Status

implemented

## Summary

The Flutter customer runtime now has the right backend contracts for chat, terminal, browser, and files, but it still presents too much false confidence and too few direct recovery actions when the runtime degrades. This spec makes runtime health explicit inside chat, replaces placeholder or fake “online” states with real sandbox health, and adds direct recovery controls for the runtime tools the operator is actively using.

## Related Notes

- [[018-ruh-app]] — owns the Flutter runtime screens, providers, and services that surface health and recovery
- [[003-sandbox-lifecycle]] — documents sandbox health semantics, restart behavior, and runtime liveness
- [[004-api-reference]] — existing sandbox status, restart, browser, and workspace file routes are the contract for this slice
- [[014-auth-system]] — customer sessions must remain scoped to active customer-org ownership while recovering runtime state
- [[SPEC-ruh-app-chat-first-agent-config]] — the runtime workspace is now chat-first, so recovery controls must live inside chat rather than behind a separate detail screen

## Specification

### Goals

1. Show truthful sandbox/runtime state inside the primary chat surface.
2. Give operators direct recovery controls where chat, browser, and files fail.
3. Avoid adding new backend routes unless an existing route cannot support the UX.

### First Slice

- Replace the chat header’s fake `Online` state with real sandbox health derived from `/api/sandboxes/:id/status`.
- Poll sandbox health while chat is open so runtime status can recover or degrade without a full page reload.
- Add a runtime status banner in chat when the sandbox is unreachable or the gateway is unhealthy.
- Banner actions:
  - refresh runtime status
  - retry chat/session hydration
  - restart the sandbox/runtime
- Add explicit refresh affordances inside:
  - Browser tab
  - Files tab
- Mission Control quick actions should prefer real recovery actions over placeholder buttons.

### Health States

- `Healthy`
  - container running and gateway reachable
- `Gateway unhealthy`
  - container running but gateway unreachable
  - user copy should explain that browser/files/chat may be stale or unavailable
- `Runtime unreachable`
  - container not running or status read failed
  - user copy should explain that the runtime needs refresh/restart
- `Checking runtime`
  - initial fetch or transient refresh state

### Non-Goals For This Slice

- new backend proxy or recovery routes beyond existing restart/status endpoints
- full workspace file editing
- full browser-target/web-product support
- changing the marketplace/install entitlement model

## Implementation Notes

- Prefer central polling in the sandbox-health provider rather than ad hoc timers in multiple widgets.
- Reuse the existing `POST /api/sandboxes/:id/restart` backend route for recovery.
- Keep recovery actions fail-closed and visible; do not silently auto-restart sandboxes from the client.
- Add focused Flutter tests for provider refresh/restart behavior and widget-level recovery affordances.

## Test Plan

- Provider tests:
  - sandbox health polling/refresh path returns updated health
  - restart action triggers backend restart and refreshes health
- Widget tests:
  - runtime banner shows degraded/offline state with recovery actions
  - Browser tab exposes refresh affordance and retries screenshot fetch
  - Files tab exposes refresh affordance and retries workspace file listing
- Manual verification:
  - open an installed agent
  - confirm header shows real runtime status instead of unconditional `Online`
  - simulate unhealthy runtime and confirm the banner + restart action appear
  - confirm Browser and Files can be refreshed without leaving chat
