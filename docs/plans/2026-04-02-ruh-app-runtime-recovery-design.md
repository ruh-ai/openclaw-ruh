# Ruh App Runtime Recovery Design

Date: 2026-04-02

## Problem

The Flutter runtime surface is no longer fundamentally broken, but it still feels unreliable because the UI overstates health and understates recovery options:

- chat header shows `Online` whenever a sandbox id exists
- browser and files rely on local loading/error states with weak recovery affordances
- the best recovery action is hidden in Mission Control instead of living where the failure happens

## Approaches Considered

### 1. Backend-first recovery expansion

Add new recovery/status endpoints and make the client a thin consumer.

- Pros:
  - backend owns more runtime semantics
  - could enable richer diagnostics later
- Cons:
  - overkill for the current known gap
  - slows down the first recovery slice
  - adds contract surface before proving the UI need

### 2. Flutter-first recovery UX on top of current routes

Use the current status and restart routes, centralize polling in the health provider, and expose recovery actions in chat/browser/files.

- Pros:
  - fastest path to a materially better operator experience
  - stays within the existing runtime contract
  - easy to verify with focused Flutter tests
- Cons:
  - still limited by the depth of existing backend diagnostics

### 3. Fully automatic client self-healing

Have the client auto-refresh and auto-restart aggressively when health degrades.

- Pros:
  - less operator effort in theory
- Cons:
  - too risky for first pass
  - hides state transitions
  - may restart healthy sandboxes due to transient network issues

## Recommendation

Take approach 2.

The first missing product capability is not deeper diagnostics. It is clear truth and direct recovery in the runtime surface the operator is already using. We should centralize health polling in Flutter, make status labels honest, and add deliberate recovery actions without expanding the backend contract yet.

## First Slice

1. Poll sandbox health from the provider layer while chat is open.
2. Replace fake chat-header status with real health labels.
3. Add a runtime recovery banner for degraded/offline states.
4. Add refresh controls in Browser and Files.
5. Replace Mission Control’s placeholder quick action with a real refresh/restart pairing.

## Success Criteria

- Operators can tell the difference between healthy, degraded, and unreachable runtime states without guessing.
- Recovery actions are available inside chat and workspace tabs, not only in side panels.
- Restarting the runtime or refreshing status updates the visible state without a full app relaunch.
