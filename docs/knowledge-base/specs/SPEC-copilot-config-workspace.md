# SPEC: Co-Pilot Config Workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agui-protocol-adoption]]

## Status

implemented

## Summary

The default `/agents/create` Co-Pilot flow should use a single builder workspace instead of splitting controls across the `Agent's Computer` panel and a standalone wizard rail. This slice moves the active Co-Pilot phase UI into the `Config` tab, keeps the other workspace tabs available during creation, and adds builder-aware auto-focus rules so the right surface is shown as the architect moves through tools and phases.

## Related Notes

- [[008-agent-builder-ui]] — the create-flow shell, Co-Pilot mode, and computer-view behavior live here
- [[011-key-flows]] — the end-to-end builder walkthrough should describe the unified workspace behavior
- [[SPEC-agui-protocol-adoption]] — builder-mode focus signals should compose with the AG-UI event/state migration instead of introducing another parallel state path
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving-case path should use this unified builder workspace

## Specification

### Goal

Ship a builder UX where:
- `/agents/create` no longer renders a standalone far-right Co-Pilot wizard rail
- the `Agent's Computer` `Config` tab becomes the canonical builder-control surface
- terminal/code/browser/files tabs remain available during creation
- builder phase changes can focus `Config`, while runtime tool activity can still focus terminal/code/browser
- reopening an existing agent through `Build` uses that same Co-Pilot workspace instead of a separate legacy builder shell

### Layout Contract

In Co-Pilot mode:
- the page keeps the builder chat column on the left
- the right side shows only the existing `Agent's Computer` workspace panel
- the `Config` tab contains:
  - a compact config summary / live builder snapshot
  - the Co-Pilot phase stepper
  - the active phase content (`purpose`, `skills`, `tools`, `triggers`, `review`)

The old standalone `WizardStepRenderer` rail must not remain visible as a separate page column.

### Focus Contract

The workspace should auto-focus according to these rules:

1. **Builder phase change wins**
   - When the architect or the operator changes the Co-Pilot phase to `skills`, `tools`, `triggers`, or `review`, the active workspace tab should switch to `config`.

2. **Runtime tool activity still drives runtime tabs**
   - shell-like tools switch to `terminal`
   - file/code-edit tools switch to `code`
   - browser tools switch to `browser`

3. **Manual override remains temporary**
   - A recent manual tab click should continue suppressing generic tool-based auto-switching for a short debounce window.
   - Explicit builder phase changes are allowed to override that temporary suppression and return focus to `config`, because they represent a new required operator task.

### Builder Config Surface

The `Config` tab should remain useful even before a skill graph exists:
- before architect output, it shows the existing empty config state
- once builder data exists, it shows the compact summary and the active Co-Pilot phase controls/content
- the phase stepper should stay visible while the operator works inside builder mode

### Existing-Agent Reopen Contract

- `Build` on a saved agent should land in Co-Pilot mode by default.
- Route entry must seed the shared Co-Pilot store from the saved agent snapshot so purpose, selected skills, tool connections, triggers, and accepted improvements are visible immediately.
- Existing-agent completion remains on Improve Agent semantics: persist edits, hot-push running sandboxes when applicable, and return to `/agents` rather than entering the new-agent first-deploy handoff.

## Implementation Notes

- `CoPilotLayout.tsx` should stop allocating a dedicated right-hand wizard column.
- `WizardStepRenderer.tsx` should be embeddable inside `AgentConfigPanel` or a builder-only config wrapper without duplicating outer layout chrome.
- `TabChat.tsx` / `ComputerView` should accept enough builder state to auto-focus `config` on phase changes while preserving existing runtime tab auto-switch behavior.
- The shipped implementation threads the shared `coPilotStore` through `TabChat` into `useAgentChat()` so architect AG-UI events and the Config-tab UI stay on one synchronized builder state source.
- The same Config-tab workspace now also surfaces the safe draft save loop from that AG-UI state path, so operators can see `Saving draft…`, `Draft saved`, or `Draft save failed` before entering Review and final deploy can promote the existing `draftAgentId` instead of creating a second agent record.
- Existing-agent reopen now uses one explicit Co-Pilot seed helper and a completion-kind branch so the shared workspace can serve both new-agent and Improve Agent entry paths without mixing their post-save contracts.
- The builder `TabChat` shell must preserve an explicit full-height contract when mounted inside the create-flow wrapper; relying only on flex growth is insufficient because the Co-Pilot page hosts the chat/workspace shell inside a non-flex block container.
- This slice should stay builder-only and avoid changing deployed-agent workspace behavior.

## Test Plan

- `agent-builder-ui/e2e/create-agent.spec.ts`
- Focused passing coverage now includes:
  - `renders Co-Pilot inside Config tab`
  - `shows live agent info and draft save status before review`
  - `completes full create agent workflow end to end`

Manual/operator verification:
- Open `/agents/create`
- Confirm there is no standalone far-right Co-Pilot wizard column
- Verify the `Config` tab contains the phase stepper and active Co-Pilot content
- Send a builder prompt and confirm builder phase changes can focus `Config`
- Confirm browser/code/terminal activity can still focus the corresponding runtime tabs
- Open `/agents`, click `Build` on an existing agent, and confirm the same Co-Pilot workspace is preloaded with the saved builder state
