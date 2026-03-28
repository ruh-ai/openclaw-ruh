# LEARNING: Architect Bridge Retries Can Duplicate Runs

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-gateway-error-reporting]] | [[SPEC-architect-bridge-retry-safety]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the architect bridge implementation was inspected after ruling out already-tracked auth, provisioning, approval, and sandbox-lifecycle gaps.

## What Was Learned

- The architect bridge currently treats transport retry as "resend the whole run," not "continue the same logical request."
- `connectWithRetry()` wraps the entire WebSocket and `chat.send` path, while `forwardToGateway()` generates a fresh `randomUUID()` idempotency key every time it sends `chat.send`.
- Because the same route still auto-approves `exec.approval.requested` events, a retry after `chat.send` has already been accepted can duplicate side effects, not just duplicate text responses.
- The client side has no abort path for an in-flight architect request, so navigation, reset, or user retry cannot cleanly stop the bridge from continuing its retry loop.

## Evidence

- `agent-builder-ui/app/api/openclaw/route.ts`:
  - `connectWithRetry()` retries the full request loop on any non-auth failure.
  - `forwardToGateway()` sends `chat.send` with `idempotencyKey: randomUUID()`.
  - The same route auto-resolves `exec.approval.requested` with `decision: "allow"`.
- `agent-builder-ui/lib/openclaw/api.ts` starts the bridge `fetch()` without accepting or passing an `AbortSignal`.
- `agent-builder-ui/hooks/use-openclaw-chat.ts` awaits `sendToArchitectStreaming()` directly and does not cancel that request on navigation, reset, or replacement send.
- Existing `TODOS.md` tasks already cover bridge auth, session-token hardening, architect isolation, and approval guardrails, but none explicitly make retry behavior safe after a run has already crossed the gateway acceptance boundary.

## Implications For Future Agents

- Treat architect retry safety as a separate reliability/safety boundary from auth, isolation, or error classification.
- Do not change bridge retry behavior without reasoning about the `chat.send` acceptance boundary and whether a follow-up attempt is a true resume or a second run.
- Prefer stable logical request IDs plus explicit cancellation semantics before adding more automatic retry behavior around architect runs.

## Follow-Up Implementation

- `agent-builder-ui/lib/openclaw/api.ts` now accepts `requestId` and `AbortSignal`, and `useOpenClawChat()` aborts/reset-cleans in-flight architect requests so stale completions do not append follow-up errors.
- `agent-builder-ui/app/api/openclaw/route.ts` now reuses the client `request_id` as the gateway `chat.send.idempotencyKey`, retries only before `chat.send` acknowledgement, and surfaces a typed post-accept disconnect error instead of resending.
- Focused regressions now cover request identity forwarding, store abort behavior, and the pre-accept vs. post-accept retry boundary.
- The separate blanket auto-approval risk called out in this learning was later addressed by [[SPEC-architect-exec-approval-policy]] and [[LEARNING-2026-03-26-architect-approval-policy]].

## Links

- [[008-agent-builder-ui]]
- [[001-architecture]]
- [[SPEC-agent-builder-gateway-error-reporting]]
- [[SPEC-architect-bridge-retry-safety]]
- [Journal entry](../../journal/2026-03-25.md)
