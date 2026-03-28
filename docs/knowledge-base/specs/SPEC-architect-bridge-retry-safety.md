# SPEC: Architect Bridge Retry Safety

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[001-architecture|Architecture Overview]]

## Status

implemented

## Summary

The architect bridge for `/agents/create` must treat one user message as one logical architect run, even when the transport is flaky. This spec adds a stable client-supplied request identity, cancelation semantics, and a fail-closed retry boundary so the bridge does not resubmit `chat.send` after the gateway has already accepted the run.

## Related Notes

- [[008-agent-builder-ui]] — owns the `/api/openclaw` bridge, the create-flow client, and the operator-visible retry/cancel behavior
- [[001-architecture]] — documents the architect bridge as the server-held gateway transport layer for builder chat
- [[SPEC-agent-builder-gateway-error-reporting]] — composes with retry safety by classifying terminal runtime errors without treating them as reconnectable transport failures

## Specification

### Scope

This spec applies to the builder-side architect request path:

- `agent-builder-ui/lib/openclaw/api.ts`
- `agent-builder-ui/hooks/use-openclaw-chat.ts`
- `agent-builder-ui/app/api/openclaw/route.ts`

### Stable logical request identity

1. The client must generate exactly one stable logical request ID per user message before the bridge request starts.
2. The client must send that ID to `/api/openclaw` as part of the request body.
3. The bridge must reuse that same ID as the gateway `chat.send.idempotencyKey`.
4. Safe retries before gateway acceptance must reuse the same logical request ID. The bridge must never mint a fresh idempotency key for a retry of the same user message.

### Retry boundary

1. The bridge may retry only while it can prove the request has not crossed the `chat.send` acceptance boundary.
2. The request is considered accepted once the gateway returns a successful response to the `chat.send` request or a `runId` for that request.
3. If the transport fails after acceptance, the bridge must fail closed for that HTTP request instead of resending `chat.send`.
4. Post-acceptance failures should surface a typed bridge error that explains the run may still be finishing remotely and that the operator should retry explicitly rather than assuming nothing happened.

### Cancelation semantics

1. The browser client must support `AbortSignal` for architect bridge requests.
2. Starting a replacement architect request or resetting the builder flow must abort the previous in-flight request locally.
3. Client aborts or HTTP disconnects must stop any scheduled retry delay and close the WebSocket.
4. Aborted requests must not append stale completions or error messages into the current builder session state.

### Observability

1. Retry and failure logs should include the stable request ID and whether failure happened before or after `chat.send` acknowledgement.
2. Operator-facing lifecycle events should remain truthful: retry messaging is only allowed before acceptance, and post-acceptance disconnects should be described as uncertain completion rather than a clean reconnect.

### Non-goals

- Adding full run reattachment/resume against the gateway after a disconnect
- Changing tool auto-approval policy
- Reworking AG-UI adoption or the broader create-flow UI shell

## Implementation Notes

- `sendToArchitectStreaming()` accepts a caller-provided `requestId` plus optional `AbortSignal`.
- `useOpenClawChat()` owns one in-flight `AbortController`, aborts it on replacement send/reset, and ignores stale completions by checking the active request ID before committing results.
- `/api/openclaw` distinguishes failures before vs. after `chat.send` acknowledgement and only retries the pre-acceptance slice.
- Post-acknowledgement disconnects resolve as a typed bridge error rather than resending `chat.send` with a new idempotency key.

## Test Plan

- `bun test agent-builder-ui/lib/openclaw/api.test.ts`
- `bun test agent-builder-ui/hooks/use-openclaw-chat.test.ts`
- `bun test agent-builder-ui/app/api/openclaw/route.test.ts`
