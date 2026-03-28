# LEARNING: `/agents/create` still drops unsaved Configure state between Review and Configure

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run reviewed the active Google Ads creation-focus lane after the repo had already shipped structured saved `toolConnections[]`, `triggers[]`, connector-status metadata, and persisted builder improvements. The goal was to identify the single highest-value missing feature package that was still not already represented in `TODOS.md`.

## What Was Learned

The create flow now has a richer saved config contract than its own unsaved session state. Before the first save, Review and Configure do not actually share one source of truth for tool and trigger choices.

- `page.tsx` renders Review from `workingAgent?.toolConnections` and `workingAgent?.triggers`, which means Review falls back to the last persisted snapshot and ignores unsaved Configure edits for new agents or in-progress Improve Agent sessions.
- The same page seeds `ConfigureAgent` only from `workingAgent` as `initialToolConnections` and `initialTriggers`, so reopening Configure after leaving the step restores stale persisted data instead of the operator's current in-flight choices.
- `ConfigureAgent.tsx` keeps tool connections, credential drafts, selected skills, and triggers in local component state until `onComplete()`, so backing out of Configure unmounts that state and silently discards unsaved Google Ads config work.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` sets `const reviewToolConnections = workingAgent?.toolConnections ?? [];` and `const reviewTriggers = workingAgent?.triggers ?? [];`.
- The same file passes `initialToolConnections={workingAgent?.toolConnections}` and `initialTriggers={workingAgent?.triggers}` into `ConfigureAgent`.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConfigureAgent.tsx` owns `toolConnections`, `credentialDrafts`, `selectedSkills`, and `selectedTriggers` with local `useState()` and only emits them from `onComplete()`.

## Implications For Future Agents

- Treat pre-save Configure state as a first-class create-session contract, not as temporary component-local UI that can be reconstructed from the saved agent later.
- Do not add more Review, deploy-readiness, or Google Ads configuration work that reads only `workingAgent` while unsaved session edits can still diverge from it.
- Keep credential drafts ephemeral, but lift their ownership high enough that Review, Configure, and final save all operate on the same unsaved session snapshot.

## Resolution

Worker-1 completed the follow-on fix later on 2026-03-26:

- `agent-builder-ui/app/(platform)/agents/create/create-session-config.ts` now defines the page-owned create-session snapshot for `toolConnections`, ephemeral `credentialDrafts`, selected skill ids, and `triggers`.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` now seeds and owns that snapshot, passes it into Review and Configure, and uses it again during final save so Review and persistence stay aligned.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConfigureAgent.tsx` is now a controlled wrapper, so leaving Configure no longer drops unsaved Google Ads connector plans or trigger selections.

Future work in deploy-readiness and Improve Agent should build on this page-owned session contract rather than reintroducing per-step local config stores.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
