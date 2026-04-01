# LEARNING: Deployed-chat code handoff should stay session-scoped

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[013-agent-learning-system]]

## Context

The deployed-agent Files tab already reset selected-file state per sandbox and conversation, but the new code-control handoff slice needed to decide whether ownership cues and archive export should summarize the whole workspace root or only the active run's folder.

## What Was Learned

The first shipped handoff/export slice should stay scoped to the active conversation session folder instead of summarizing the full sandbox workspace.

Why this matters:

- The existing Files tab already reads `sessions/<conversation_id>` for deployed-chat output, so summarizing the whole workspace would reintroduce cross-run leakage that the first files/artifacts slice intentionally avoided.
- Operators mostly need to take ownership of the code generated in the run they are looking at now, not a blended archive of every prior run left in `~/.openclaw/workspace`.
- Session-scoped archive eligibility makes unavailable states truthful and predictable. A large stale workspace elsewhere in the sandbox should not block exporting the current run's bounded output.

## Implications For Future Agents

- Keep handoff summaries and archive exports aligned with the same relative workspace folder the Files tab is currently listing.
- If a future feature adds whole-workspace export or Git-aware ownership, make it a separate explicit surface instead of silently changing the current session-scoped contract.
- Preserve the bounded archive rules even if future UI work adds richer code actions like diffing or write-back editing.

## Links

- [[SPEC-deployed-chat-code-control-handoff]]
- [[SPEC-deployed-chat-files-and-artifacts-workspace]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-25.md)
