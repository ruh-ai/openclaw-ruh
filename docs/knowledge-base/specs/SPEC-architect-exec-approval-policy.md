# SPEC: Architect Exec Approval Policy

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[001-architecture|Architecture Overview]]

## Status

implemented

## Summary

The `/api/openclaw` architect bridge must stop auto-approving every execution request. This feature adds a fail-closed approval policy for `exec.approval.requested` events, emits structured approval SSE events to the builder client, and limits auto-allow behavior to a small safe allowlist that can be explained to operators.

## Related Notes

- [[001-architecture]] — documents the privileged bridge layer between the builder and the architect gateway
- [[008-agent-builder-ui]] — owns the builder bridge, client streaming contract, and operator-visible approval state
- [[011-key-flows]] — documents the `/agents/create` request flow that must now surface approval outcomes truthfully
- [[SPEC-control-plane-audit-log]] — approval outcomes should stay structured enough to plug into the shared audit contract later
- [[SPEC-architect-bridge-retry-safety]] — approval gating composes with the existing fail-closed retry boundary for architect runs

## Specification

### Scope

This spec applies to the architect builder request path only:

- `agent-builder-ui/app/api/openclaw/route.ts`
- `agent-builder-ui/lib/openclaw/api.ts`
- `agent-builder-ui/hooks/use-openclaw-chat.ts`

### Approval policy

1. The bridge must classify every `exec.approval.requested` payload before sending any resolution back to the gateway.
2. Requests that are clearly read-only and low-risk may be auto-allowed.
3. Requests that are dangerous, write-capable, destructive, or too underspecified to classify safely must fail closed.
4. The first shipped allowlist is intentionally narrow and may only auto-allow known safe metadata or inspection operations.

### Operator-visible events

1. The bridge must emit structured SSE events when an approval request is auto-allowed or denied.
2. The emitted payload must include a stable approval id, a human-readable tool label, the policy decision, and a safe summary of what was requested.
3. The builder client must preserve these events distinctly from generic lifecycle status text so the UI and state layer can show what happened.

### Gateway resolution behavior

1. Auto-allowed requests must still send `exec.approval.resolve { decision: "allow" }` to the gateway.
2. Denied or unclassifiable requests must send `exec.approval.resolve { decision: "deny" }`.
3. The bridge must never silently continue past a non-allowlisted approval request.

### Initial non-goals

- Browser-side Approve / Deny controls for interactive approval decisions
- Long-lived pending approval state across page refreshes
- Shared backend audit persistence for architect approvals

The first slice is server-classified and fail closed: safe requests continue, everything else is denied with visible operator feedback.

## Implementation Notes

- Add a small policy helper in the bridge route to classify approval payloads by tool name, command summary, and safe metadata exposed by the gateway frame.
- Extend the SSE client parser to understand dedicated approval event types in addition to `status` and `result`.
- Extend `useOpenClawChat()` with bounded approval event history so the builder can expose what was auto-allowed or denied without depending on generic prose.
- Keep the event payload session-scoped and safe for browser display: no raw secret material, no full shell command when the payload is not known-safe.

## Test Plan

- `bun test agent-builder-ui/app/api/openclaw/route.test.ts`
- `bun test agent-builder-ui/lib/openclaw/api.test.ts`
- `bun test agent-builder-ui/hooks/use-openclaw-chat.test.ts`
