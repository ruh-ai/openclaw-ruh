# SPEC: Ruh App Chat-First Agent Config

[[000-INDEX|← Index]] | [[018-ruh-app]] | [[004-api-reference]] | [[014-auth-system]]

## Status

draft

## Summary

The Flutter customer app should stop routing users through a separate agent detail dead-end before they can work. This spec makes the installed-agent open flow chat-first, then adds a first-class `Agent Config` tab inside the runtime workspace so operators can view the creation-time configuration and safely edit the runtime-owned parts of that configuration without crossing into builder-only agent authoring APIs.

## Related Notes

- [[018-ruh-app]] — owns the Flutter routes, chat surface, and runtime workspace tabs
- [[004-api-reference]] — documents the new customer-safe config read/write contract
- [[014-auth-system]] — defines the active customer-org ownership guard for the new mutation seam

## Specification

### Chat-First Open Flow

- installed-agent cards in the Flutter workspace should launch the runtime and open the chat surface directly
- the primary CTA should describe the real destination clearly, for example `Open chat`
- `/chat/:agentId` remains the canonical runtime route
- `/agents/:agentId` should no longer behave like a separate detail destination for customers; it should resolve to the same runtime surface with the config tab preselected for backwards compatibility with older links

### Runtime Workspace Tabs

The right-side `Agent's Computer` workspace in `ruh_app` should expose four tabs:

- `Terminal`
- `Files`
- `Browser`
- `Agent Config`

The config tab is part of the same runtime surface as chat, not a separate page. On mobile it must be reachable from the same bottom-sheet workspace surface that currently holds the runtime tabs.

### Agent Config Information Architecture

The `Agent Config` tab should present one combined runtime-facing view of the agent configuration that was created earlier and is now persisted on the agent record.

The surface should include:

- editable runtime fields:
  - `name`
  - `description`
  - `agent rules`
  - runtime input `value`s only
  - workspace memory (`instructions`, `continuity summary`, `pinned paths`)
- read-only configuration context:
  - `skills`
  - `tool connections`
  - `triggers`
  - `channels`
  - runtime/deployment status summary
  - optional `creation_session` snapshot when present on the agent record

The editable/read-only split is intentional:

- customer operators can tune runtime behavior and context
- builder-only authoring structures such as trigger definitions, tool metadata, or skill graph topology remain protected in this first slice

### Backend Customer-Safe Config Contract

The Flutter config tab must not reuse the generic builder-focused agent patch routes for runtime editing.

Add a dedicated customer-safe contract:

- `GET /api/agents/:id/customer-config`
  - requires auth
  - requires an active customer organization
  - only resolves agents owned by the current user in the active customer org
  - returns a normalized runtime config snapshot containing:
    - `agent`: id, name, description, avatar, status, sandboxIds, createdAt, updatedAt
    - `agentRules`
    - `runtimeInputs`
    - `toolConnections`
    - `triggers`
    - `channels`
    - `skills`
    - `workspaceMemory`
    - `creationSession` when available
- `PATCH /api/agents/:id/customer-config`
  - same ownership/auth rules as the read route
  - accepts only:
    - `name`
    - `description`
    - `agentRules`
    - `runtimeInputValues`
  - rejects unknown fields
  - preserves runtime-input metadata and updates only `value` by matching on `key`
  - returns the same normalized snapshot shape as the read route

The existing workspace-memory routes remain valid and should continue to be used for memory-specific persistence if that keeps the Flutter implementation simpler. The config tab may orchestrate both contracts behind one save flow.

### UX Behavior

- entering the config tab should load the current config snapshot explicitly, not depend on stale list-card data
- save state should be visible
- failed saves should be section-scoped and recoverable
- runtime input editing should clearly distinguish labels/descriptions from actual operator-provided values
- read-only sections should still help users understand how the agent was set up during creation, even when those sections are not editable yet

## Implementation Notes

- prefer reusing the existing `Agent` model where possible, but do not overload it if a dedicated `CustomerAgentConfig` DTO keeps the Flutter surface clearer
- keep the customer-safe backend routes separate from builder-only routes such as `PATCH /api/agents/:id` and `PATCH /api/agents/:id/config`
- the optional `creation_session` payload is allowed to be large and irregular, so the Flutter UI should render a bounded summary rather than assuming a rigid schema
- repurpose the old customer detail route instead of maintaining two competing customer runtime entry points

## Test Plan

- backend unit/app tests:
  - customer-config read route enforces active-customer-org ownership
  - customer-config patch route rejects unknown fields
  - runtime-input patching updates `value` only and preserves metadata
- Flutter widget/service tests:
  - installed-agent CTA navigates directly into chat
  - the runtime workspace renders the new `Agent Config` tab
  - config-tab save flow calls the customer-safe backend contract
  - `/agents/:id` compatibility path opens the runtime surface with config selected
- verification:
  - `bun test` for targeted backend route coverage
  - `flutter test` for updated widget/service coverage
  - manual macOS runtime pass for open-chat, config load, edit, save, and refresh
