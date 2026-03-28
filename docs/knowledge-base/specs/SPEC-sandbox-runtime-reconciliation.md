# SPEC: Sandbox Runtime Reconciliation

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[004-api-reference]]

## Status

implemented

## Summary

Sandbox runtime truth is now reconciled across PostgreSQL and Docker instead of assuming that a saved sandbox row means a live runtime exists. The backend exposes explicit drift states, an admin reconciliation report, and bounded admin repair actions so operators can detect and clean up DB-only or container-only sandboxes before other lifecycle or health work builds on stale state.

## Related Notes

- [[003-sandbox-lifecycle]] — sandbox existence spans persisted metadata plus Docker runtime state
- [[004-api-reference]] — documents the drift-aware status route and admin reconcile/repair routes
- [[005-data-models]] — clarifies that the `sandboxes` table is metadata, not sole runtime truth
- [[011-key-flows]] — operator debugging and lifecycle flows now rely on explicit drift states

## Specification

### Drift States

The backend classifies sandbox runtime into one of these states:

- `healthy` — sandbox row exists, matching `openclaw-<sandbox_id>` container exists and is running, and the gateway responds
- `gateway_unreachable` — sandbox row exists and a matching container exists, but the gateway is not currently reachable
- `db_only` — sandbox row exists but there is no matching managed Docker container
- `container_only` — a managed `openclaw-*` container exists with no matching sandbox row
- `missing` — neither a sandbox row nor a managed container exists for the requested id

### Runtime Source Of Truth

- PostgreSQL remains the source of saved sandbox metadata.
- Docker runtime inventory is the source of live container existence and running state.
- Route handlers must not silently treat one source as authoritative for both concerns.

### Route Contract

- `GET /api/sandboxes/:sandbox_id/status` includes `drift_state`, `container_exists`, `container_running`, `container_name`, `container_state`, `container_status`, and `gateway_reachable`.
- When the gateway responds, the route still merges gateway payload fields into the same response.
- `GET /api/admin/sandboxes/reconcile` requires `Authorization: Bearer <OPENCLAW_ADMIN_TOKEN>` and returns a bounded report with `summary` counts plus per-sandbox runtime items.
- `POST /api/admin/sandboxes/:sandbox_id/reconcile/repair` requires the same admin token and accepts one safe action at a time:
  - `delete_db_record` for `db_only`
  - `remove_orphan_container` for `container_only`

### Repair Guardrails

- Repair actions are fail-closed: the backend returns `409` if the requested action does not match the current drift state.
- DB cleanup reuses the existing sandbox delete path so associated conversations are removed consistently.
- Orphan-container cleanup reuses the existing Docker removal helper.
- Successful repairs emit a `sandbox.reconcile_repair` audit event with the action and prior drift state.

## Implementation Notes

- Added Docker inventory parsing in `ruh-backend/src/docker.ts` for managed `openclaw-*` containers.
- Added a pure reconciliation module in `ruh-backend/src/sandboxRuntime.ts` so drift-state behavior stays testable outside Express handlers.
- Updated `ruh-backend/src/app.ts` to return truthful status metadata and to expose admin reconcile plus repair routes.

## Test Plan

- Unit: drift classification returns the expected `healthy`, `gateway_unreachable`, `db_only`, and `container_only` states from mixed DB/Docker inputs.
- Unit app-route coverage: status route reports `db_only`, admin reconcile requires a bearer token, the reconcile report includes DB-only and container-only rows, and repair deletes a stale DB record only when the drift state matches.
- Operator verification:
  - stop or remove a tracked sandbox container and confirm the status route shows `db_only`
  - inspect `GET /api/admin/sandboxes/reconcile` with an admin token and confirm summary counts match the drifted runtime set
  - run one safe repair action and confirm the stale row or orphan container is removed
