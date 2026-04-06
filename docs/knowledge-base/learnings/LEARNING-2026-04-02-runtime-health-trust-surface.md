# LEARNING: Runtime trust should come from polled health and explicit recovery, not sandbox presence

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[018-ruh-app]] | [[SPEC-ruh-app-runtime-recovery]]

## Date
- 2026-04-02

## Context
- After the Flutter runtime contract was repaired, the customer app still felt unreliable because the UI continued to infer runtime health from weak signals like “there is an active sandbox id” or “the chat screen opened successfully.”

## What Happened
- The chat header displayed `Online` whenever a sandbox id existed.
- Browser and Files had local loading or empty states, but they did not give the operator a consistent recovery path from the active workspace.
- Mission Control still held the clearest runtime action, which meant recovery was separated from the failure point.

## Durable Insight
- Runtime trust is a product contract, not just a backend contract.
- Even when backend routes are correct, the runtime still feels broken if the UI:
  - overstates health
  - hides recovery actions behind a secondary panel
  - forces the operator to guess whether the issue is chat, browser, files, or the runtime itself
- The correct first slice is:
  - poll health centrally
  - surface truthful status in the primary runtime UI
  - provide explicit recovery actions where failures happen

## Fix
- Replaced the one-shot sandbox health read with a polling provider in `ruh_app/lib/providers/sandbox_health_provider.dart`.
- Updated the chat header to use real health labels (`Healthy`, `Gateway unhealthy`, `Runtime unreachable`, `Checking runtime`).
- Added `ChatRuntimeStatusBanner` so degraded or offline runtime states can recover through:
  - retry chat
  - refresh status
  - restart runtime
- Added manual refresh controls to Browser and Files.

## Verification
- `cd ruh_app && flutter test test/providers/sandbox_health_provider_test.dart test/widgets/runtime_status_banner_test.dart test/widgets/code_panel_test.dart test/widgets/browser_panel_test.dart`
- `cd ruh_app && flutter analyze lib/providers/sandbox_health_provider.dart lib/screens/chat/chat_screen.dart lib/screens/chat/widgets/runtime_status_banner.dart lib/screens/chat/widgets/browser_panel.dart lib/screens/chat/widgets/code_panel.dart lib/screens/chat/tabs/tab_mission_control.dart`

## Follow-up
- If runtime trust still feels weak, the next places to improve are stale or offline chat indicators and smarter file refresh behavior after file tools run.
