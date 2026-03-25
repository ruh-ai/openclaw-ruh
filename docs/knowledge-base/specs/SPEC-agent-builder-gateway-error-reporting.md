# SPEC: Agent Builder Gateway Error Reporting

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[001-architecture|Architecture Overview]]

## Status

implemented

## Summary

Clarifies how the `agent-builder-ui` bridge should report architect-run failures that come back from the OpenClaw gateway after a successful WebSocket connection. Terminal provider authentication errors, especially `FailoverError` payloads carrying LLM `401 authentication_error` responses, must be surfaced directly to the user instead of being retried and mislabeled as gateway connectivity failures.

## Related Notes

- [[008-agent-builder-ui]] — owns the `/api/openclaw` bridge route and its retry/error semantics
- [[001-architecture]] — documents the architect request path and where gateway failures are introduced

## Specification

### Scope

This spec applies to the create-agent architect bridge at `agent-builder-ui/app/api/openclaw/route.ts`.

### Required behavior

1. The bridge must distinguish between:
   - connection/authentication failures reaching the OpenClaw gateway itself
   - terminal runtime failures reported by the architect run after the gateway connection is already established
2. Runtime failures that indicate provider authentication problems must not be retried.
3. Provider authentication failures must be returned to the client as a typed `error` result with guidance to update provider credentials or sandbox LLM settings.
4. These failures must not be rewritten into the generic "Unable to reach the OpenClaw gateway" message.

### Provider-auth failure detection

The bridge should treat runtime errors as terminal provider-auth failures when the gateway error text contains signals such as:

- `authentication_error`
- `Failed to authenticate`
- `API Error: 401`
- invalid API key markers like `invalid x-api-key`

### Non-goals

- Changing sandbox credential storage or LLM provider configuration flows
- Changing the retry behavior for genuinely transient transport failures

## Implementation Notes

- Added `agent-builder-ui/lib/openclaw/error-classification.ts` so route-level error classification is pure and regression-testable.
- `chat.state === "error"` now classifies runtime failures before deciding whether to resolve a typed error or retry the connection.
- Added a focused Bun regression test covering a `FailoverError` payload with a nested `401 authentication_error`.

## Test Plan

- `bun test agent-builder-ui/lib/openclaw/error-classification.test.ts`
- `npx tsc --noEmit` in `agent-builder-ui/`
