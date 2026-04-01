# SPEC: Create Flow Lifecycle Navigation

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]] | [[SPEC-agent-create-session-resume|Agent Create Session Resume]]

## Status

implemented

## Summary

The `/agents/create` lifecycle stepper must distinguish between the stage the operator is currently viewing and the furthest stage the draft has already reached. Refresh-resumed drafts may reopen directly on `review` or later; inspecting `build`, `plan`, or `think` from the stepper must not retroactively lock forward stages or force the architect to regenerate work that already exists.

## Related Notes

- [[008-agent-builder-ui]] — owns the Co-Pilot lifecycle store and the embedded stage stepper UI
- [[011-key-flows]] — documents the operator-visible create-flow lifecycle and restore behavior
- [[SPEC-agent-create-session-resume]] — refresh/reopen restore must preserve the same lifecycle reachability the backend/local cache had already recovered

## Specification

### Separate Current Stage From Furthest Progress

- The lifecycle store must persist both:
  - the current viewed stage (`devStage`)
  - the furthest stage already unlocked (`maxUnlockedDevStage`)
- `maxUnlockedDevStage` must never be behind `devStage`.
- When older cached state lacks `maxUnlockedDevStage`, restore logic must infer it from `devStage`.

### Stepper Clicks Are Non-Destructive

- Clicking an already-unlocked earlier stage in the stepper is an inspection/navigation action only.
- That interaction may change `devStage`, but it must not reduce `maxUnlockedDevStage`.
- Any stage at or before `maxUnlockedDevStage` must remain reachable after that inspection jump.
- Done-state badges should be derived from `maxUnlockedDevStage`, not from the currently viewed stage alone, so earlier completed phases remain visually complete while the operator inspects an earlier step.

### Footer Back Is Destructive Rewind

- The footer `Back` control remains the explicit rewind action.
- Rewind moves to the immediately previous stage, resets that target stage status to `idle`, and caps `maxUnlockedDevStage` at the same target stage.
- This preserves the existing contract where Back is used to reopen and redo an earlier lifecycle phase, while the stepper is used to inspect already-completed work.

## Implementation Notes

- `agent-builder-ui/lib/openclaw/copilot-state.ts` now stores `maxUnlockedDevStage`, infers it during `hydrateFromSeed()`, preserves it during `setDevStage()`, advances it during forward movement, and rewinds it only in `goBackDevStage()`.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx` now derives stepper unlock/done state from `maxUnlockedDevStage` instead of the currently viewed `devStage`.
- `agent-builder-ui/lib/openclaw/copilot-lifecycle-cache.ts` now persists `maxUnlockedDevStage` so refresh-resumed drafts keep the same reachability contract.

## Test Plan

- `cd agent-builder-ui && bun test lib/openclaw/copilot-state.test.ts`
- `cd agent-builder-ui && bun test lib/openclaw/copilot-lifecycle-cache.test.ts`
- `cd agent-builder-ui && bun test 'app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts'`
- `cd agent-builder-ui && npx tsc --noEmit`
