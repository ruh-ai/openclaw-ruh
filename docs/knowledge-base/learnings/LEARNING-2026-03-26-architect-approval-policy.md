# LEARNING: Architect approval bridge should deny by default

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-architect-exec-approval-policy]]

## Context

The create-flow architect bridge previously auto-approved every `exec.approval.requested` frame. That made the server-held gateway token equivalent to "run any approved tool the architect asks for," with no meaningful policy boundary between safe inspection requests and repo-mutating execution.

## What Was Learned

- The first safe product move is not a partial manual-approval UI; it is a deny-by-default server policy with one tiny read-only allowlist.
- The bridge needs to emit structured approval events even when it denies immediately, otherwise future UI or audit work has to reverse-engineer what happened from generic status text or terminal errors.
- Returning a typed `approval_denied` result from the bridge is better than waiting for the gateway to time out or infer a later error after the server already knows it denied the request.

## Evidence

- `agent-builder-ui/app/api/openclaw/route.ts` now classifies approval requests, emits `approval_auto_allowed`, `approval_required`, and `approval_denied`, sends `decision: "deny"` for non-allowlisted requests, and resolves the HTTP request with a typed `approval_denied` error.
- `agent-builder-ui/lib/openclaw/api.ts` now parses those SSE events as first-class approval events instead of dropping them.
- `agent-builder-ui/hooks/use-openclaw-chat.ts` now stores approval events so future builder UI work can read a real structured history.
- Focused verification passed:
  - `cd agent-builder-ui && bun test app/api/openclaw/route.test.ts`
  - `cd agent-builder-ui && bun test lib/openclaw/api.test.ts`
  - `cd agent-builder-ui && bun test hooks/use-openclaw-chat.test.ts`

## Implications For Future Agents

- Do not widen the auto-allow list casually. If a request is not obviously read-only from safe metadata, deny it.
- Build any future interactive approval UI on top of the existing approval event stream and typed `approval_denied` result rather than restoring optimistic server-side allow behavior.
- If approval decisions need durable provenance, connect this event contract to [[SPEC-control-plane-audit-log]] instead of inventing a separate frontend-only history store.

## Links

- [[001-architecture]]
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-architect-exec-approval-policy]]
- [[SPEC-control-plane-audit-log]]
- [Journal entry](../../journal/2026-03-26.md)
