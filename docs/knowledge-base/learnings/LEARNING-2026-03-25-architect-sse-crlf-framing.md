# LEARNING: Architect SSE CRLF Framing Must Be Normalized

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-learning-and-journal]]

## Context

`agent-builder-ui/lib/openclaw/api.ts` consumes the `/api/openclaw` SSE stream on the client side and extracts `status` and `result` events for the builder chat flow.

## What Was Learned

The client cannot assume SSE frames are delimited with LF-only blank lines. When the bridge or an intermediary emits standard CRLF framing, splitting only on `\n\n` merges multiple events into one block, which turns a valid `status` + `result` sequence into an invalid combined JSON payload and causes the builder to reject a healthy stream.

## Evidence

- Added a regression to `agent-builder-ui/lib/openclaw/api.test.ts` where the stream emits `status` and `result` events separated with `\r\n\r\n`
- The first run of `bun test agent-builder-ui/lib/openclaw/api.test.ts` failed because `sendToArchitectStreaming()` logged a JSON parse failure and then rejected with `SSE stream ended without a result event`
- Normalizing incoming chunks to LF before splitting event blocks made the same command pass

## Implications For Future Agents

- Preserve architect SSE regressions for LF-only, final-buffer, multiline-`data:`, and CRLF framing cases together when changing `sendToArchitectStreaming()`
- Treat line-ending normalization as part of the protocol parser, not a transport-specific nicety
- If the bridge implementation changes or proxies are introduced, verify framing tolerance before assuming the client parser is still safe

## Links
- [[008-agent-builder-ui]]
- [[LEARNING-2026-03-25-architect-sse-final-buffer]]
- [[LEARNING-2026-03-25-architect-sse-multiline-data]]
- [Journal entry](../../journal/2026-03-25.md)
