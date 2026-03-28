# LEARNING: AG-UI transcript rendering still bypasses the message lifecycle

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agui-protocol-adoption]]

## Context

The active `docs/project-focus.md` still puts [[SPEC-agui-protocol-adoption]] first, but the current `TODOS.md` backlog already had packages for the broad cutover and the builder snapshot/delta state seam. This run re-checked the live AG-UI consumer path to see whether a separate highest-value gap remained before the focus lane could claim the standard protocol was truly the active contract.

## What Was Learned

The remaining unowned gap is the transcript lifecycle itself. `BuilderAgent` and `SandboxAgent` already emit AG-UI `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` events, but `useAgentChat()` still ignores start/end, inserts a special assistant message when `skill_graph_ready` arrives, and then appends another assistant turn by rebuilding content from `liveResponse` and `deltaMachine` after the run completes. AG-UI is therefore still acting as a transport envelope while the actual transcript contract remains a custom local reducer.

## Evidence

- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` emits `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` for clarification, `ready_for_review`, and ordinary `agent_response` cases.
- `agent-builder-ui/lib/openclaw/ag-ui/sandbox-agent.ts` emits `RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, and `RUN_FINISHED` for deployed sandbox chat runs.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` handles only `TEXT_MESSAGE_CONTENT`, ignores `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END`, pushes a standalone assistant message for `skill_graph_ready`, and later appends a second assistant message from `liveResponse` plus `deltaMachine.getRawBuf()`.
- No active TODO entry before this run explicitly owned replacing that local transcript assembler with the AG-UI message lifecycle, even though existing tasks already covered state snapshots and broader cutover cleanup.

## Implications For Future Agents

- Treat AG-UI transcript adoption as separate from AG-UI state adoption. Finishing snapshot/delta state work still leaves a standards gap if message rendering continues to bypass `TEXT_MESSAGE_*`.
- When working in `useAgentChat()`, prefer one in-flight assistant message reducer keyed by AG-UI `messageId` over more post-run transcript assembly or special-case builder message injection.
- Keep custom events for metadata such as builder state, browser frames, and editor notifications, but do not duplicate conversational text onto those metadata events once the transcript reducer lands.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agui-protocol-adoption]]
- [Journal entry](../../journal/2026-03-27.md)
