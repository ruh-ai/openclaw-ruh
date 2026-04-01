# LEARNING: Architect SSE Data Lines Must Be Rejoined

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-learning-and-journal]]

## Context

`agent-builder-ui/lib/openclaw/api.ts` consumes the `/api/openclaw` SSE stream on the client side and parses `status` and `result` events emitted by the architect bridge.

## What Was Learned

The client cannot assume one logical SSE payload arrives in a single `data:` line. Per the SSE framing rules, one event may contain multiple `data:` lines that must be rejoined with newline separators before JSON parsing. Keeping only the last `data:` line drops most of the payload and turns a valid `result` event into a false parser failure.

## Evidence

- Added a regression to `agent-builder-ui/lib/openclaw/api.test.ts` where the final `result` event contains pretty-printed JSON split across multiple `data:` lines
- The first run of `bun test agent-builder-ui/lib/openclaw/api.test.ts` failed because `sendToArchitectStreaming()` tried to parse only `}` and then rejected with `SSE stream ended without a result event`
- Updating the helper to accumulate all `data:` lines and join them with `\n` made the same command pass

## Implications For Future Agents

- Treat the architect bridge SSE client as a protocol parser, not a line-based convenience helper
- Preserve regressions for both end-of-stream buffering and multi-line `data:` events when changing `sendToArchitectStreaming()`
- If the bridge starts emitting formatted JSON or longer payloads, the client should continue to parse them without requiring one-line event bodies

## Links
- [[008-agent-builder-ui]]
- [[LEARNING-2026-03-25-architect-sse-final-buffer]]
- [Journal entry](../../journal/2026-03-25.md)
