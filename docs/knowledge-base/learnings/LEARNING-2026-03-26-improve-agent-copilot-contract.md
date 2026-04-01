# LEARNING: Improve Agent needs an explicit Co-Pilot seed and completion split

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-copilot-config-workspace]] | [[SPEC-agent-learning-and-journal]]

## Context

`TASK-2026-03-26-121` moved existing-agent `Build` sessions onto the shipped Co-Pilot workspace so the Google Ads proving-case journey no longer splits create and improve flows across different builder shells.

## What Was Learned

Improve Agent could not reuse the Co-Pilot workspace safely with a route toggle alone. Two explicit contracts were required:

- existing-agent entry must hydrate the shared Co-Pilot Zustand store from the saved agent snapshot, not just pass `existingAgent` as display fallback props
- Co-Pilot completion must branch on existing-agent vs new-agent ownership so Improve Agent persists edits and hot-pushes running sandboxes instead of entering the first-deploy handoff used by drafts and brand-new agents

Without the store hydration step, purpose fields stay blank in the real Co-Pilot state, downstream tabs remain gated, and the UI can regenerate or clear saved graph data even though the shell renders the saved agent name and description. Without the completion split, Improve Agent edits land in the wrong post-save route and bypass the existing hot-push contract.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` now defaults existing-agent entry to Co-Pilot mode, calls `coPilotStore.hydrateFromSeed(createCoPilotSeedFromAgent(existingAgent))`, and resets the store on fresh entry.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts` now owns the reusable `createCoPilotSeedFromAgent()` and `resolveCoPilotCompletionKind()` helpers.
- `agent-builder-ui/lib/openclaw/copilot-state.ts` now exposes `hydrateFromSeed()` so the page can seed one clean Co-Pilot session from persisted agent data.
- `agent-builder-ui/lib/openclaw/copilot-flow.test.ts` proves saved human-readable skill names normalize back to canonical ids during Improve Agent hydration and proves existing-agent completion stays on the improve path.

## Implications For Future Agents

- Treat Co-Pilot as stateful builder infrastructure, not a pure presentational shell. Reopen flows must seed the store deliberately.
- When adding future Improve Agent behavior, preserve the existing-agent completion split unless the product intentionally changes the hot-push contract.
- Reuse `createCoPilotSeedFromAgent()` instead of re-deriving saved-agent-to-Co-Pilot mapping in multiple components.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-copilot-config-workspace]]
- [Journal entry](../../journal/2026-03-26.md)
