# LEARNING: Flutter runtime surfaces depend on transcript-backed tool replay and self-healing sandbox browser services

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[004-api-reference]] | [[018-ruh-app]]

## Date
- 2026-04-02

## Context
- The seeded customer runtime for `prasanjit@ruh.ai` could authenticate and launch, but the Flutter chat screen still looked broken: the browser panel showed “not connected,” terminal/tool activity never appeared, and the agent status check kept reporting an unhealthy runtime.

## What Happened
- The sandbox container was healthy enough to answer chat, but three lower-level contracts were wrong:
  - backend sandbox status still probed `GET /api/status` on the OpenClaw gateway even though the real health path was `GET /health`
  - the optional browser stack (`Xvfb`, `x11vnc`, `websockify`) could be missing after launch/restart even when the container and gateway were otherwise healthy
  - ordinary OpenClaw operator WebSocket runs did not emit live tool frames, even though the session JSONL transcript clearly persisted `toolCall` and `toolResult` messages for the same turn

## Durable Insight
- Flutter runtime surfaces should not treat “container running” as equivalent to “workspace fully interactive.”
- For sandbox status, the stable source of gateway liveness is the gateway `/health` response merged with Docker state.
- For browser status/screenshot, the backend should self-heal the browser services once before failing because the container often has the binaries installed but not the processes running.
- For tool activity, the current reliable fallback is the latest turn in the OpenClaw session transcript:
  - `sessions.json` maps `sessionKey -> sessionFile`
  - the session `.jsonl` stores `assistant.content[].type == "toolCall"` and `toolResult` rows even when the WebSocket stream omits live tool events
  - replaying only the tool rows after the last `user` message prevents older session history from being duplicated into the current UI turn

## Fix
- Added `ruh-backend/src/sessionToolTranscript.ts` to parse the session index + transcript and extract latest-turn tool events.
- Updated `ruh-backend/src/app.ts` so:
  - `GET /api/sandboxes/:sandbox_id/status` probes gateway `/health`
  - `/api/sandboxes/:sandbox_id/browser/status` and `/browser/screenshot` retry after `ensureInteractiveRuntimeServices()`
  - `POST /api/sandboxes/:sandbox_id/chat/ws` replays transcript-backed `tool_start` / `tool_end` events before `[DONE]` when the live operator socket produces none
- Updated `ruh_app` so:
  - `BrowserPanel` fetches screenshot bytes via a dedicated `getBytes()` client path
  - health polling derives from `SandboxHealth.gatewayReachable`

## Verification
- `cd ruh-backend && JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/customerAgentLaunchApp.test.ts tests/unit/utils.test.ts tests/unit/sessionToolTranscript.test.ts tests/e2e/chatProxy.test.ts`
- `cd ruh-backend && bun run typecheck`
- `cd ruh_app && flutter test test/services/auth_service_test.dart test/services/chat_service_test.dart test/services/marketplace_service_test.dart test/services/workspace_service_test.dart test/widgets/browser_panel_test.dart`
- Live local verification:
  - sandbox status reports `gateway_reachable: true`
  - browser status reports `active: true`
  - browser screenshot returns JPEG bytes
  - chat SSE emits transcript-backed tool start/end events for `exec`

## Follow-up
- If Flutter web becomes a supported target instead of a debug-only inspection path, add a first-class browser-target test harness that can log in and inspect the canvas-rendered UI more directly than headless DOM automation.
