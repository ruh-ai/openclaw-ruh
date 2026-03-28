# LEARNING: Sandbox Runtime Drift Is Hidden By DB Fallbacks

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

While reviewing the repo for the highest-leverage untracked backlog gap, the sandbox lifecycle, API surface, and existing health panels all pointed at the same structural issue: sandbox metadata lives in PostgreSQL, but real runtime existence lives in Docker, and the current product does not reconcile those two layers.

## What Was Learned

- Sandbox existence currently has two unsynchronized sources of truth: PostgreSQL `sandboxes` rows and Docker `openclaw-<sandbox_id>` containers.
- The backend treats PostgreSQL as authoritative for list/detail/status fallbacks after creation, so a missing or dead container can still look like a normal sandbox record.
- Future lifecycle and health work should not build only on `approved`, `sandbox_state`, or row existence; they need explicit runtime reconciliation first or they will surface misleading health.

## Evidence

- `ruh-backend/src/store.ts` powers list/detail reads entirely from PostgreSQL and does not inspect Docker runtime state.
- `ruh-backend/src/app.ts` deletes the sandbox row before best-effort container removal and `GET /api/sandboxes/:sandbox_id/status` falls back to record data when the gateway is unreachable.
- `ruh-frontend/components/MissionControlPanel.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` render `Running` from `approved` or sandbox presence rather than inspected runtime truth.
- `ruh-backend/src/docker.ts` exposes low-level `docker exec` and `docker rm` helpers, but no container inventory or reconciliation primitive.

## Implications For Future Agents

- Treat runtime existence and persisted metadata as separate contracts when touching sandbox lifecycle code.
- Do not extend health dashboards or operator status UIs using only DB fallback responses; add or consume an explicit drift state first.
- Cleanup work needs a report-and-repair path for `db_only` and `container_only` sandboxes, not just undeploy flows for the happy path.

## Links

- [[003-sandbox-lifecycle]]
- [[004-api-reference]]
- [[005-data-models]]
- [[SPEC-sandbox-runtime-reconciliation]]
- [Journal entry](../../journal/2026-03-25.md)
