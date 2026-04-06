# SPEC: Pre-Deploy Agent Testing

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

The review phase in `agent-builder-ui` should let operators send trial prompts to the in-progress agent before deployment. The builder reuses the existing architect gateway session transport, but injects the generated SOUL content into a separate `agent:test:*` session so test traffic does not contaminate the main architect conversation.

## Related Notes

- [[008-agent-builder-ui]] — owns the review UI, bridge route, and client transport used for builder-time testing
- [[011-key-flows]] — documents the create-agent flow and now includes the review-phase test loop before deployment
- [[007-conversation-store]] — session-key isolation matters even when the chat is still builder-local

## Specification

### Bridge request contract

- `POST /api/openclaw` accepts two optional fields in addition to the existing create-flow payload:
  - `mode?: "build" | "test"`
  - `soul_override?: string`
- When `mode` is omitted, the route behaves exactly like the architect build flow today.
- When `mode` is `"test"`:
  - the bridge must use `sessionKey = "agent:test:<session_id>"` unless an explicit non-architect `agent` value is supplied in the future
  - if `soul_override` is non-empty, the outgoing gateway `message` must prepend a system block before the user prompt:
    ```
    [SYSTEM]
    <soul_override>

    [USER]
    <message>
    ```
  - the isolated test session must not reuse the architect build session key

### Review UI contract

- `ReviewAgent.tsx` and the embedded Co-Pilot review step in `WizardStepRenderer.tsx` each expose a `Test Agent` action before the user deploys.
- The test surface is builder-local and resettable:
  - it shows the active agent name
  - it keeps its own short message history separate from `useOpenClawChat`
  - closing the panel clears the test-only history and any pending error/loading state
- Both review surfaces build the current review snapshot from one shared helper and send it through `buildSoulContent(...)` so the test reflects the latest saved-config contract shown to the operator: name, rules, selected skills, persisted tool readiness, structured trigger support/runtime state, and accepted builder improvements.
- The injected SOUL must remain safe for browser-visible testing: raw credential values, tokens, callback URLs, and similar secret-bearing details are excluded from the prompt summary.

### Client transport contract

- `sendToArchitectStreaming()` accepts optional `mode` and `soulOverride` fields and forwards them to `/api/openclaw`.
- Existing architect build callers continue to work without modification because the default mode is `build`.

## Implementation Notes

- Primary files:
  - `agent-builder-ui/app/api/openclaw/route.ts`
  - `agent-builder-ui/lib/openclaw/api.ts`
  - `agent-builder-ui/lib/openclaw/agent-config.ts`
  - `agent-builder-ui/lib/openclaw/copilot-flow.ts`
  - `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`
  - `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`
- Keep the first slice narrow: no persisted transcripts, no deployed-sandbox reuse, and no extra backend service.
- Add low-cost regression coverage around the request body and injected gateway payload before broadening into end-to-end browser tests.

## Test Plan

- Unit: `sendToArchitectStreaming()` forwards `mode` and `soulOverride` to `/api/openclaw`
- Unit: a bridge helper builds `agent:test:<session_id>` session keys and injects the `[SYSTEM]` / `[USER]` payload wrapper
- Unit: `buildSoulContent()` includes the agent name, skills, rules, and a safe connector/trigger/improvement summary used by review-mode test chat
- Unit: the shared review snapshot builder preserves projected `toolConnections[]`, runtime inputs, and `triggers[]` when either review surface prepares its isolated test session
- Browser: open the embedded Co-Pilot review step, send a test prompt, and confirm the test chat stays separate from the architect builder history
- Manual: open either review surface, send a test prompt, and confirm the test chat stays separate from the architect builder history

## Related Learnings

- [[LEARNING-2026-03-26-soul-config-context-gap]] — the review-test transport and deploy-time prompt should reuse one safe saved-config summary instead of drifting away from the Review/Deploy contract
- [[LEARNING-2026-03-29-eval-engine-mock-api-architecture]] — mock mode eval for enterprise adoption; heuristic scoring tuned for the proving case
