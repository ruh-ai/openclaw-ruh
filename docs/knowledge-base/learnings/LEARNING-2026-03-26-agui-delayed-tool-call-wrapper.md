# LEARNING: AG-UI Delayed Tool-Call Wrapper

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agui-protocol-adoption]]

## Context

While adding bounded coverage for the active [[SPEC-agui-protocol-adoption]] lane, the AG-UI text delta state machine in `agent-builder-ui/lib/openclaw/ag-ui/event-middleware.ts` was exercised against split tool-call chunks instead of the single-chunk shape used by the existing tests.

## What Happened

The stream parser already handled `<function=...>...</function></tool_call>` when both closing tags arrived in the same chunk. It did not handle the common split-chunk variant where `</function>` arrived first and a delayed `</tool_call>` wrapper arrived in the next delta. In that case the parser had already left `in_tool` mode, so the next chunk was treated as ordinary assistant text and the literal wrapper leaked into the visible transcript.

## Durable Rule

- Treat a leading `</tool_call>` chunk as transport framing, not user-visible text, whenever the parser is no longer in `in_tool` mode.
- Keep a unit regression for split wrapper chunks close to `createTextDeltaStateMachine()` so future AG-UI refactors do not reintroduce the leak.
- Prefer unit coverage for chunk-boundary behavior before relying on broader browser tests, because these failures are cheap to reproduce in Bun and easy to miss in manual chat verification.

## References

- [[008-agent-builder-ui]] — owns the AG-UI streaming and `TabChat` integration surface
- [[SPEC-agui-protocol-adoption]] — the migration contract for replacing legacy transport parsing with AG-UI event/state handling
- [event-middleware.ts](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/ag-ui/event-middleware.ts)
- [event-middleware.test.ts](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-middleware.test.ts)
