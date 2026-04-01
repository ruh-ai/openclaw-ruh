# SPEC: Ruh App Customer Surface Redesign

[[000-INDEX|← Index]] | [[018-ruh-app]] | [[016-marketplace]] | [[014-auth-system]]

## Status

implemented

## Summary

The Flutter customer app now has real marketplace install/use flows and native auth, but the UI still presents those capabilities with weak hierarchy and an overly internal tone. This spec defines a focused redesign of the shell and core customer surfaces so the app feels trustworthy, warm, and productized without changing the underlying backend contracts.

## Related Notes

- [[018-ruh-app]] — primary Flutter surface architecture and current routes
- [[016-marketplace]] — marketplace catalog/detail/install behavior inside the Flutter app
- [[014-auth-system]] — multi-org customer context that should be visible in the UI

## Specification

### Shared Shell

- desktop sidebar should show more than navigation:
  - brand
  - active organization
  - signed-in user identity
  - compact workspace/status context
- selected navigation states should feel more intentional and easier to scan
- mobile framing should preserve the same product language even when the persistent sidebar is absent

### Installed Agents Workspace

- the root screen should behave like a workspace home, not just a grid of cards
- add a strong page header with:
  - title
  - supporting copy
  - quick workspace summary such as installed count and last-opened context
- improve empty/loading/error states so they feel customer-facing and not generic
- installed agent cards should better express:
  - identity
  - category/value
  - recency
  - one clear next action

### Marketplace List And Detail

- remove implementation-facing copy about mock/dummy/backend states
- keep search and category filters, but present them with stronger hierarchy and spacing
- keep live install state, but frame it in customer language
- detail page should emphasize:
  - what the agent helps with
  - social/trust metadata already available in the current DTO
  - install/use state
  - next step back to workspace after install

### Agent Detail

- the customer detail view should prioritize:
  - the agent’s identity and value
  - runtime readiness
  - open/launch chat as the primary action
- raw skills/tools/triggers can remain present, but should be visually de-emphasized below the primary action area

### Settings

- account and organization context should appear before developer/QA controls
- backend URL and connection testing remain available for local development, but should not visually lead the page

## Implementation Notes

- keep existing route structure and data providers
- prefer composition and reusable section/header widgets over a theme-only solution
- stay within the existing Ruh brand tokens from `DESIGN.md` rather than importing a separate external palette
- implemented in:
  - `ruh_app/lib/config/routes.dart`
  - `ruh_app/lib/screens/agents/agent_list_screen.dart`
  - `ruh_app/lib/screens/agents/agent_detail_screen.dart`
  - `ruh_app/lib/screens/marketplace/marketplace_screen.dart`
  - `ruh_app/lib/screens/marketplace/marketplace_detail_screen.dart`
  - `ruh_app/lib/screens/settings/settings_screen.dart`

## Test Plan

- extend Flutter widget tests for:
  - shell context rendering
  - workspace header/empty-state rendering
  - marketplace copy/card rendering
- verified with:
  - `flutter test test/screens/agent_list_screen_test.dart test/config/marketplace_routes_test.dart test/config/routes_test.dart`
  - `flutter analyze`
