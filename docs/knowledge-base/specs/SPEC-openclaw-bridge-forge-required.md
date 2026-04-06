# SPEC: Forge-only Builder Bridge

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]]

## Status
implemented

## Summary
`POST /api/openclaw` now fails closed when the caller does not provide a per-agent `forge_sandbox_id`. The retired shared architect fallback must not open or retry the legacy `OPENCLAW_GATEWAY_URL`; instead the route returns an explicit builder-not-ready error until the agent's own forge sandbox exists.

## Related Notes
- [[008-agent-builder-ui]] — owns the bridge route, SSE contract, and builder transport expectations
- [[011-key-flows]] — documents the `/agents/create` build flow that now depends on forge-backed routing only
- [[SPEC-agent-create-session-resume]] — refresh and reopen must preserve forge sandbox identity so the bridge can reconnect truthfully

## Specification
### Request contract
- `POST /api/openclaw` remains the authenticated builder bridge entrypoint.
- Builder chat that expects architect execution must send `forge_sandbox_id` for the agent's dedicated forge sandbox.
- Missing `forge_sandbox_id` is treated as a not-ready builder state, not as a reason to reuse a shared architect sandbox.

### Transport behavior
- The bridge resolves the forge sandbox gateway from the backend record and prefers direct WebSocket transport for real-time tool and workspace events.
- If the forge gateway rejects or drops the direct WebSocket path, the route may fall back to the forge sandbox HTTP chat proxy.
- The route must never construct or retry the retired shared `OPENCLAW_GATEWAY_URL` path when `forge_sandbox_id` is absent.

### Response contract when forge sandbox is missing
- The SSE stream emits `status` with `phase: "error"` and message `Agent workspace is not ready yet`.
- The terminal `result` payload is a typed error:
  - `type: "error"`
  - `error: "forge_sandbox_not_ready"`
  - `content`: explicit guidance that the per-agent forge sandbox is missing or still provisioning and the retired shared architect gateway will not be used
- This fail-closed path happens before any shared-gateway WebSocket connection or retry logic.

## Implementation Notes
- Route logic lives in `agent-builder-ui/app/api/openclaw/route.ts`.
- Route-level regression coverage lives in `agent-builder-ui/app/api/openclaw/route.test.ts`.
- The route test suite now uses forge sandbox fixtures for active bridge behavior so the retired shared path is exercised only by the explicit regression.

## Test Plan
- Route regression: requests without `forge_sandbox_id` return the typed not-ready error and construct zero WebSocket connections.
- Route regression: active bridge tests run through a forge sandbox fixture and continue to cover approval events, delta streaming, intermediate updates, and structured response normalization.
