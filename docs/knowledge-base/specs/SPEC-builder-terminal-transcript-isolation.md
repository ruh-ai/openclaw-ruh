# SPEC: Builder Terminal Transcript Isolation

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]] | [[SPEC-copilot-config-workspace|Co-Pilot Config Workspace]]

## Status

implemented

## Summary

Commands entered from the builder-side `Agent's Computer` terminal should behave like terminal activity, not like normal chat. In `/agents/create`, manual terminal runs now stay in the workspace terminal history and no longer append synthetic user/assistant turns to the left chat transcript unless no structured workspace artifact was produced.

## Related Notes

- [[008-agent-builder-ui]] — `TabChat.tsx` owns the shared chat/workspace shell and terminal input path
- [[011-key-flows]] — the create-agent walkthrough defines the operator-visible Co-Pilot workspace contract
- [[SPEC-copilot-config-workspace]] — builder mode already shares one workspace shell; terminal behavior must stay aligned with that model
- [[SPEC-agent-computer-terminal-shell]] — terminal presentation and transcript isolation are separate parts of the same Agent's Computer contract

## Specification

### Scope

This applies to the builder `/agents/create` workflow when the operator enters commands through the `Terminal` tab in `Agent's Computer`.

It does not yet change deployed-agent chat history semantics.

### Run-Surface Contract

- Builder terminal submissions still use the same architect run pipeline, but they must be marked as workspace-origin activity instead of normal chat-origin activity.
- Workspace-origin runs must not append the synthetic terminal command prompt to the left transcript.
- Workspace-origin runs must not show the live streaming assistant bubble in the left transcript while the terminal run is active.
- When the completed run produced structured workspace artifacts such as tool steps, browser state, or a task plan, those artifacts must remain attached to the historical message so the right-side workspace can replay terminal history after the run ends.
- Historical workspace messages used only for replay may be hidden from transcript rendering.
- If a workspace-origin run produces no structured workspace artifact, transcript fallback is allowed so operators still see the assistant result.

### Non-goals

- Do not change ordinary chat prompts in builder mode.
- Do not remove terminal/task/browser replay data from message history.
- Do not silently change deployed-agent chat persistence rules without a backend contract change.

## Implementation Notes

- `agent-builder-ui/lib/openclaw/ag-ui/run-surface-policy.ts` centralizes the transcript-vs-workspace visibility rules.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` accepts a per-run `surface` option, suppresses transcript rendering for workspace runs, and stores hidden replay-only messages when the workspace needs historical steps.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sends builder terminal commands with `surface: "workspace"` and filters hidden replay messages out of the visible transcript.

## Test Plan

- `cd agent-builder-ui && bun test 'lib/openclaw/ag-ui/__tests__/run-surface-policy.test.ts'`
- `cd agent-builder-ui && npx tsc --noEmit`
