# SPEC: Agent Sandbox Health Surface

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[004-api-reference]]

## Status

implemented

## Summary

The deployed-agent surfaces should expose live sandbox health instead of inferring liveness from persisted agent metadata alone. This spec adds one explicit backend runtime signal, `container_running`, to the sandbox status response and defines a lightweight polling contract for the Agent Builder UI so operator-facing badges can distinguish running sandboxes from stopped or unreachable ones.

## Related Notes

- [[008-agent-builder-ui]] — owns the deployed-agent list and chat header status UI
- [[004-api-reference]] — documents the sandbox status endpoint contract consumed by the UI
- [[003-sandbox-lifecycle]] — runtime health is separate from persisted sandbox metadata

## Specification

### Backend status contract

- `GET /api/sandboxes/:sandbox_id/status` remains the canonical runtime status endpoint for deployed-agent health checks.
- The response must always include:
  - `sandbox_id`
  - `sandbox_name`
  - `approved`
  - `created_at`
  - `gateway_port`
  - `container_running: boolean`
- `container_running` is derived from Docker runtime inspection of `openclaw-<sandbox_id>`, not from PostgreSQL row presence or `approved` state.
- When the sandbox gateway responds successfully, the backend returns the gateway payload merged with the metadata above.
- When the gateway is unavailable, the backend returns the fallback metadata payload above without pretending the sandbox is healthy.

### Builder UI polling contract

- The Agent Builder UI polls the sandbox status endpoint for each deployed sandbox ID on mount and every 30 seconds.
- The first poll happens immediately instead of waiting for the first interval tick.
- The polling layer must abort in-flight requests on unmount or when the watched sandbox ID set changes.

### UI interpretation rules

- `running`: `container_running === true` and the backend returned a live gateway signal indicating the sandbox is reachable. Current backend responses may report this as `status: "live"`, `gateway_reachable: true`, `ok: true`, `drift_state: "healthy"`, or the older gateway status strings (`running`, `healthy`, `ready`, etc.).
- `stopped`: `container_running === false`.
- `unreachable`: `container_running === true` but the gateway health payload is unavailable or not clearly healthy.
- `loading`: initial client state before the first completed poll for a sandbox ID.

### UI surfaces

- Agent list cards show a deployment-health dot next to the deployment count badge when the agent has one or more `sandboxIds`.
- Deployed-agent chat headers show the active sandbox health label.
- When the active sandbox is not healthy, the chat header may surface a direct redeploy affordance.

## Implementation Notes

- Keep the status UI conservative: do not infer `running` from `approved`, `sandbox_state`, or sandbox-row existence alone.
- Keep the polling helper separate from presentation so the fetch/abort contract can be unit-tested without rendering the full page.

## Test Plan

- Backend route test covers gateway-success and gateway-fallback responses including `container_running`.
- Builder unit tests cover status classification, polling updates, and abort-on-stop behavior for the polling helper used by the hook.
