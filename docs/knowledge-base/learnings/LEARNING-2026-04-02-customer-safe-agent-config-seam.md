# LEARNING: Customer runtime tuning needs a dedicated safe config seam

[[000-INDEX|← Index]] | [[004-api-reference]] | [[014-auth-system]] | [[018-ruh-app]] | [[SPEC-ruh-app-chat-first-agent-config]]

## Date
- 2026-04-02

## Context
- The Flutter customer app needed a first-class `Agent Config` tab inside the chat workspace so operators could tune an installed agent without leaving the live runtime surface.

## What Happened
- The obvious implementation path was to reuse the existing builder agent patch routes:
  - `PATCH /api/agents/:id`
  - `PATCH /api/agents/:id/config`
- That would have been the wrong boundary.
- Those routes are builder-authoring surfaces: they assume creator ownership, developer-org access, and broader authoring structures such as `skillGraph`, `workflow`, tool metadata, triggers, and channels.
- The customer runtime surface only needed a narrower set of runtime-operable fields:
  - `name`
  - `description`
  - `agentRules`
  - runtime-input `value`s
  - workspace-memory instructions, continuity summary, and pinned paths

## Durable Insight
- Customer runtime tuning and builder authoring are different contracts even when they operate on the same `agents` row.
- If customer surfaces reuse builder patch routes, one of two bad outcomes follows:
  - the backend becomes over-permissive and leaks authoring authority into customer sessions
  - the UI becomes brittle because it depends on builder-only ownership checks and field semantics that do not match runtime editing
- The correct model is:
  - dedicated customer-safe route for editable runtime metadata
  - read-only exposure for richer authoring/runtime context
  - shared workspace-memory route only when ownership is resolved from the active org context rather than builder-only creator assumptions

## Fix
- Added `GET /api/agents/:id/customer-config` to return a redacted runtime snapshot for installed agents.
- Added `PATCH /api/agents/:id/customer-config` to allow only:
  - `name`
  - `description`
  - `agentRules`
  - `runtimeInputValues`
- Left skills, tool connections, triggers, channels, and creation-session metadata read-only in the customer surface.
- Updated `GET/PATCH /api/agents/:id/workspace-memory` to resolve ownership from the active org context so the same runtime-memory concept works from both builder and customer surfaces without widening builder config routes.

## Verification
- `cd ruh-backend && JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/agentWorkspaceMemoryApp.test.ts tests/unit/customerAgentConfigApp.test.ts`
- `cd ruh-backend && bun run typecheck`
- `cd ruh_app && flutter test test/screens/agent_list_screen_test.dart test/services/customer_agent_config_service_test.dart test/widgets/agent_config_panel_test.dart`

## Follow-up
- If more fields need to become customer-editable later, add them to the customer-safe contract explicitly.
- Do not treat builder routes as a generic escape hatch for runtime UI needs; that hides a product-boundary problem instead of solving it.
