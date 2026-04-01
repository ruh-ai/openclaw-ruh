# LEARNING: Architect SSE Final Buffer Must Be Parsed

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-learning-and-journal]]

## Context

`agent-builder-ui/lib/openclaw/api.ts` consumes the `/api/openclaw` SSE stream on the client side and returns the final `ArchitectResponse` to the builder chat flow.

## What Was Learned

The SSE client cannot assume the stream ends with a trailing blank-line delimiter. If the final `result` event is the last bytes in the stream, `sendToArchitectStreaming()` must still parse the leftover buffer after `reader.read()` returns `done: true`.

## Evidence

- Added `agent-builder-ui/lib/openclaw/api.test.ts` with a fragmented SSE regression where the `result` event is split across chunks and the stream closes without a final `\n\n`
- The first run of `bun test agent-builder-ui/lib/openclaw/api.test.ts` failed because the promise rejected instead of returning the architect result
- Updating the helper to process the remaining buffer at stream close made the same command pass

## Implications For Future Agents

- Keep architect SSE parsing tolerant of end-of-stream chunking, not just well-formed separator-delimited events
- When changing `sendToArchitectStreaming()`, preserve a regression around final-buffer handling so transport fragmentation does not break builder chat completion

## Links
- [[008-agent-builder-ui]]
- [Journal entry](../../journal/2026-03-25.md)
