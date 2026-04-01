# LEARNING: Deployed Chat Browser Events Can Reuse Raw Chat SSE

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

While finishing [[SPEC-deployed-chat-browser-workspace]], the key question was whether the deployed-agent browser workspace needed a new backend route or stream-normalization layer before it could ship.

## What Was Learned

The existing sandbox chat proxy already preserves upstream SSE frames unchanged when `stream: true`, so the first browser-workspace slice can ride on that transport without modifying `ruh-backend/src/app.ts`. A top-level structured frame like `{ "browser": { ... } }` or `{ "browser_event": { ... } }` is enough for the client to build browser timeline, preview, and takeover state while still falling back to heuristic markdown parsing when those frames are absent.

## Evidence

- `ruh-backend/src/app.ts` pipes the upstream streaming response directly to the browser for `POST /api/sandboxes/:sandbox_id/chat`.
- `agent-builder-ui/lib/openclaw/browser-workspace.ts` now extracts `browser` / `browser_event` payloads from the same SSE stream consumed by `TabChat.tsx`.
- `bun test agent-builder-ui/lib/openclaw/browser-workspace.test.ts` passes for the structured browser event parser/state helper.

## Implications For Future Agents

- Prefer extending the structured `browser` / `browser_event` frame contract before adding new text-scraping heuristics in `TabChat.tsx`.
- Do not add a second transport or dedicated browser route unless the browser payload needs capabilities the raw chat SSE stream cannot support.
- Future files/artifacts/research/productization workspace slices should check whether the same chat SSE stream can carry bounded structured metadata before inventing new side channels.

## Links

- [[008-agent-builder-ui]]
- [[004-api-reference]]
- [[011-key-flows]]
- [[SPEC-deployed-chat-browser-workspace]]
- [Journal entry](../../journal/2026-03-25.md)
