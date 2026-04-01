# LEARNING: Worker Cost Tracking Must Use Text Agent References

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[005-data-models]] | [[SPEC-backend-schema-migrations]]

## Context

`ruh-backend` failed to start in local development after migration `0022_worker_cost_tracking` was added. Startup stopped before the HTTP server listened because PostgreSQL rejected the migration's new foreign keys.

## What Was Learned

`agents.id` is a `TEXT` column even though the values are UUID-shaped strings. New tables that reference agents must therefore also declare `agent_id` as `TEXT`; using PostgreSQL `UUID` for the foreign-key column is not interchangeable and causes migration bootstrap to fail when Postgres validates the constraint.

## Evidence

- `bun run dev` failed with `foreign key constraint "cost_events_agent_id_fkey" cannot be implemented` and the PostgreSQL detail `Key columns "agent_id" and "id" are of incompatible types: uuid and text.`
- A focused regression in `ruh-backend/tests/unit/schemaMigrations.test.ts` first failed because migration `0022_worker_cost_tracking` emitted `agent_id UUID`.
- A real-DB migration regression in `ruh-backend/tests/integration/schemaMigrations.test.ts` now verifies `cost_events.agent_id`, `budget_policies.agent_id`, and `execution_recordings.agent_id` all land as `text`.

## Implications For Future Agents

- When adding tables that reference app-owned ids such as `agents.id`, copy the canonical SQL type from the source table instead of inferring from the value shape.
- Schema-migration work should include at least one focused assertion on foreign-key column types when new references are introduced.
- A backend startup failure during migrations is usually a schema-contract problem first, not an Express/Bun boot problem.

## Links

- [[005-data-models]]
- [[SPEC-backend-schema-migrations]]
- [Journal entry](../../journal/2026-03-30.md)
