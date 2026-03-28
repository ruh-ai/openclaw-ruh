# LEARNING: Discovery Docs Need Saved-Agent Backfill

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-discovery-doc-persistence]]

## Context

The default `/agents/create` Co-Pilot flow now generates editable PRD/TRD discovery documents before skill generation, but those documents originally lived only in `useCoPilotStore`. Draft autosave persisted builder metadata after the skill graph existed, yet the approved discovery docs never entered the saved-agent contract.

## What Was Learned

Approved discovery docs cannot rely on the same builder-metadata autosave payload that saves skill graph and config metadata, because the first draft record may be created before the discovery documents are explicitly included. The safe fix is:
- add a bounded `discovery_documents` field to the saved agent contract
- persist that field on final save and config patch validation
- backfill the already-created draft record once approved discovery docs exist

## Evidence

- `agent-builder-ui/lib/openclaw/copilot-state.ts` stores `discoveryDocuments` only in the transient Co-Pilot Zustand store
- `agent-builder-ui/hooks/use-agents-store.ts` previously omitted discovery docs from `saveAgent`, `saveAgentDraft`, and `updateAgentConfig`
- `agent-builder-ui/lib/openclaw/copilot-flow.ts:createCoPilotSeedFromAgent()` previously reopened Improve Agent without any discovery-doc state

## Implications For Future Agents

- Treat approved PRD/TRD docs as part of the persisted builder contract, not as wizard-only UI state.
- When a new saved-agent field is introduced after draft autosave already exists, check whether the first draft create and later config patch need separate persistence steps.
- Keep Review surfaces able to show the saved requirements context so operators can verify reopen fidelity without rereading chat history.

## Links
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[005-data-models]]
- [[004-api-reference]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-agent-discovery-doc-persistence]]
- [Journal entry](../../journal/2026-03-27.md)
