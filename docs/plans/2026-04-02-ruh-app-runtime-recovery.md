# Ruh App Runtime Recovery Implementation Plan

Date: 2026-04-02

## Scope

Implement the first runtime trust-and-recovery slice from [[SPEC-ruh-app-runtime-recovery]]:

- polled sandbox health in Flutter
- truthful runtime status in chat header
- degraded/offline recovery banner with refresh/retry/restart
- Browser and Files refresh affordances

## Steps

1. Replace the one-shot sandbox health provider with a notifier-backed polling provider that supports manual refresh and restart.
2. Add a reusable runtime status/recovery widget for chat surfaces.
3. Update `ChatScreen` header and panel states to use real sandbox health and recovery actions.
4. Add refresh affordances to `BrowserPanel` and `CodePanel`.
5. Replace Mission Control placeholder quick action with a real refresh/restart pairing.
6. Add focused provider/widget tests.
7. Update KB notes and journal after implementation.

## Verification

- `flutter test` for the targeted provider/widget files
- `flutter analyze` on changed Flutter files
- manual runtime verification in the running macOS app:
  - open agent
  - observe runtime status
  - trigger refresh/restart
  - confirm browser/files recover in-place
