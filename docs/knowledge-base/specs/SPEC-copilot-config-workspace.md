# SPEC: Co-Pilot Config Workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agui-protocol-adoption]] | [[SPEC-create-flow-static-workspace-tabs]] | [[SPEC-agent-create-session-resume]]

## Status

implemented

## Summary

The default `/agents/create` Co-Pilot flow should use a single builder workspace instead of splitting controls across the `Agent's Computer` panel and a standalone wizard rail. This slice moves the active Co-Pilot phase UI into the `Config` tab and keeps the other workspace tabs available during creation. The original builder-aware auto-focus rules from this slice are now narrowed by [[SPEC-create-flow-static-workspace-tabs]], which makes the active tab fully user-controlled during the create flow.

## Related Notes

- [[008-agent-builder-ui]] — the create-flow shell, Co-Pilot mode, and computer-view behavior live here
- [[011-key-flows]] — the end-to-end builder walkthrough should describe the unified workspace behavior
- [[SPEC-agui-protocol-adoption]] — builder-mode focus signals should compose with the AG-UI event/state migration instead of introducing another parallel state path
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving-case path should use this unified builder workspace
- [[SPEC-create-flow-static-workspace-tabs]] — follow-on behavior change that suppresses create-flow auto-switching once the workspace is active
- [[SPEC-agent-create-session-resume]] — refresh/reopen must rehydrate the unified Co-Pilot workspace from backend truth plus a safe local cache

## Specification

### Goal

Ship a builder UX where:
- `/agents/create` no longer renders a standalone far-right Co-Pilot wizard rail
- the `Agent's Computer` `Config` tab becomes the canonical builder-control surface
- terminal/code/browser/files tabs remain available during creation
- create flow keeps the operator on the selected workspace tab instead of auto-switching surfaces during builder activity
- dev-only mock-stage controls stay available for debugging but are hidden unless the operator explicitly opts in on the route
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

The current create-flow workspace uses these rules:

1. **Config remains the builder control surface**
   - The `Config` tab still hosts the phase stepper and active builder controls.

2. **Operator tab choice wins**
   - While `/agents/create` is active, builder runtime events do not auto-switch the workspace to terminal, code, browser, or preview.
   - Co-Pilot phase changes also do not force the workspace back to `config`.

3. **Deployed-agent chat keeps runtime auto-switching**
   - The runtime auto-switch behavior remains available outside builder mode.

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
- `TabChat.tsx` / `ComputerView` should keep the builder workspace static during create flow while preserving existing runtime tab auto-switch behavior outside builder mode.
- The shipped implementation threads the shared `coPilotStore` through `TabChat` into `useAgentChat()` so architect AG-UI events and the Config-tab UI stay on one synchronized builder state source.
- The same Config-tab workspace now also surfaces the safe draft save loop from that AG-UI state path, so operators can see `Saving draft…`, `Draft saved`, or `Draft save failed` before entering Review and final deploy can promote the existing `draftAgentId` instead of creating a second agent record.
- Existing-agent reopen now uses one explicit Co-Pilot seed helper and a completion-kind branch so the shared workspace can serve both new-agent and Improve Agent entry paths without mixing their post-save contracts.
- Refresh/reopen now also depends on the create-session resume contract in [[SPEC-agent-create-session-resume]] so the unified workspace can recover after a hard reload without losing forge linkage or non-secret in-progress state.
- The debug-only `DevMockBar` must fail closed: ordinary local runs should not render it, and stage seeding now requires an explicit `?devMockBar=1` opt-in on `/agents/create`.
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
- Send a builder prompt, switch to another workspace tab, and confirm builder phase changes do not pull focus back to `Config`
- Confirm browser/code/terminal/preview activity does not auto-switch the workspace during `/agents/create`
- In local development, confirm the yellow DEV strip stays hidden on the default route and only appears when the page is opened with `?devMockBar=1`
- Open `/agents`, click `Build` on an existing agent, and confirm the same Co-Pilot workspace is preloaded with the saved builder state
