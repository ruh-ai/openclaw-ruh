# Co-Pilot Config Workspace Design

## Summary

The default create flow currently splits builder controls across two right-side surfaces: the `Agent's Computer` panel and a standalone Co-Pilot wizard rail. This change collapses them into a single builder workspace by rendering the active Co-Pilot phase inside the existing `Config` tab and making builder activity focus the most relevant workspace area automatically.

## Goals

- Remove the standalone far-right Co-Pilot rail from `/agents/create`.
- Make the `Config` tab the canonical builder-control surface.
- Keep terminal, code, files, and browser tabs available during agent creation.
- Auto-focus the computer view to the right tab based on architect activity.
- Preserve manual user control for normal runtime tab switching.

## Recommended Interaction Model

### Layout

- Builder mode keeps the current left chat column and the `Agent's Computer` panel.
- The `Config` tab becomes a composite builder workspace:
  - compact config summary / live builder snapshot
  - Co-Pilot phase stepper
  - active phase content (`purpose`, `skills`, `tools`, `triggers`, `review`)
- The separate `WizardStepRenderer` rail is removed from the page layout.

### Focus Rules

- Builder phase changes (`skills`, `tools`, `triggers`, `review`) should focus the `Config` tab immediately because they change the operator’s next required action.
- Generic runtime tools should keep the existing tab behavior:
  - shell tools → `terminal`
  - code/file-write tools → `code`
  - browser tools → `browser`
- Builder-specific config work should return focus to `Config`.
- Manual tab clicks should still suppress generic tab switching briefly, but explicit builder phase changes from the architect or the operator should be allowed to bring the UI back to `Config`.

### Visual Behavior

- The `Config` tab should feel like an active control room rather than a passive summary card.
- The phase stepper should stay visible at the top of the tab.
- The config summary should remain, but as a compact overview above the active step content.

## Files Likely To Change

- `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/AgentConfigPanel.tsx`
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- `agent-builder-ui/e2e/create-agent.spec.ts`

## Testing Strategy

- Add browser-level coverage that the Co-Pilot rail no longer renders as a separate page column.
- Add coverage that builder-mode phase changes can focus the `Config` tab.
- Keep existing workspace tab switching for browser, code, and terminal activity intact.

## Risks

- Builder mode already shares `TabChat` with deployed chat, so the refactor should stay narrowly scoped to builder-only props and render branches.
- The current create-flow E2E file is stale against the UI and should be tightened while adding the new assertions.
