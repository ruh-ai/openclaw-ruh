# Ruh App Customer Surface Redesign Design

## Summary

`ruh_app` now has real auth, marketplace, and installed-agent flows, but the customer-facing UI still feels like an internal tool shell rather than a premium workspace for "digital employees with a soul." This redesign pass upgrades the shared shell, installed-agents workspace, marketplace list/detail, and the customer agent detail view without reopening the full chat/computer-view architecture.

## Problem

The current Flutter app is functionally correct but weak in hierarchy and product confidence:

- the shell lacks user, org, and workspace context
- marketplace copy still explains implementation details instead of product value
- installed-agent cards are repetitive and do not help users understand priority or next action
- the customer agent detail view still reads like a builder/debug page
- settings foregrounds dev-only controls more than customer identity/context

## Approved Scope

This pass covers:

- shared shell polish on desktop and mobile
- stronger page-level hero/header patterns
- installed workspace summary + improved empty/loading/error states
- a more intentional marketplace catalog and detail presentation
- a customer-first agent detail screen with clearer primary actions
- light settings-page restructuring so account/org context leads and dev controls sink

This pass does **not** redesign the chat/computer-view architecture. That remains a follow-on slice if needed.

## Design Direction

### Product Posture

Use the repo brand in `DESIGN.md`, but shift the screen composition toward:

- warm confidence
- trust and authority
- clearer customer context
- subtle motion, not decorative motion

### Visual System Adjustments

- keep the existing purple/violet palette, but increase contrast in structure and use fewer large empty white fields
- strengthen the shell with:
  - a contextual sidebar/footer block on desktop
  - a more productized top header on mobile
- introduce a reusable page header treatment that combines:
  - eyebrow/status label
  - title
  - supporting copy
  - optional right-side actions or summary chips

### UX Adjustments

- Agents root becomes a true workspace:
  - header explaining what is installed and ready
  - a summary strip with installed count and last-opened context
  - stronger empty state that points to marketplace value, not just navigation
- Marketplace becomes customer-facing:
  - remove internal/dev copy
  - make search/category/filter hierarchy cleaner
  - make cards feel more premium and easier to scan
- Agent detail becomes action-led:
  - who this agent is
  - what it helps with
  - runtime status
  - one strong CTA to open/launch chat
  - advanced configuration metadata de-emphasized below the fold
- Settings should lead with account and org identity before backend/dev controls

## Testing Strategy

- add/extend widget tests around:
  - desktop shell context rendering
  - workspace empty/header states
  - marketplace header/card rendering
  - agent detail CTA/status presentation where feasible
- keep verification bounded to focused Flutter widget tests plus `flutter analyze`

