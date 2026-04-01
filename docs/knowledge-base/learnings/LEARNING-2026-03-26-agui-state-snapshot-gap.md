# LEARNING: AG-UI builder state still depends on custom metadata events

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agui-protocol-adoption]]

## Context

During the March 26 focus-lane backlog review, the repo already had AG-UI packages installed, `BuilderAgent` and `SandboxAgent` in place, and `TabChat.tsx` routed through `useAgentChat()`. The active project focus also put [[SPEC-agui-protocol-adoption]] first in the delivery order, so the next missing package needed to be grounded in the actual AG-UI implementation rather than generic builder polish.

## What Was Learned

The live builder contract is still split across three layers:

- `builder-agent.ts` emits builder metadata through `EventType.CUSTOM` payloads such as `skill_graph_ready` and wizard metadata events
- `use-agent-chat.ts` consumes those custom events and mirrors the result into `onBuilderStateChange`, keeping the legacy `BuilderState` bridge alive inside the AG-UI path
- `builder-metadata-autosave.ts` still imports and seeds from `BuilderState`, so draft autosave also depends on that legacy shim

That means AG-UI is currently acting as a transport envelope around bespoke builder events instead of the spec's canonical `StateSnapshot` / `StateDelta` state model. Future create-flow work that adds builder metadata will keep expanding this split unless snapshot/delta adoption becomes its own worker-owned feature slice.

## Evidence

- [[SPEC-agui-protocol-adoption]] says `ready_for_review` should map to `StateSnapshot` and incremental builder state should use `StateDelta`
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` currently emits `EventType.CUSTOM` for `SKILL_GRAPH_READY` and the wizard metadata events
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` handles those custom events but has no live `STATE_SNAPSHOT` / `STATE_DELTA` reducer path for builder metadata
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` still imports `BuilderState` from `../builder-state`

## Implications For Future Agents

- Treat snapshot/delta-driven builder state as a prerequisite seam inside the AG-UI adoption plan, not as optional cleanup after more Google Ads create-flow features land
- Avoid adding new builder metadata only to `skill_graph_ready` or the wizard custom events unless the task is explicitly transitional
- When working on AG-UI adoption, distinguish the broad legacy-file deletion work from the narrower builder-state contract migration; both are needed, but the snapshot/delta seam is the part that prevents more state duplication

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agui-protocol-adoption]]
- [Journal entry](../../journal/2026-03-26.md)
