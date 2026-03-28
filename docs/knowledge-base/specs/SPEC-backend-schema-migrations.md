# SPEC: Backend Schema Migrations

[[000-INDEX|← Index]] | [[002-backend-overview]] | [[005-data-models]] | [[010-deployment]]

## Status

implemented

## Summary

`ruh-backend` needs one backend-owned schema migration system instead of scattered `initDb()` startup DDL inside store modules. This feature adds an ordered migration ledger plus runner so fresh databases bootstrap cleanly, existing databases evolve deterministically, and future schema-changing tasks have one contract to build on.

## Related Notes

- [[002-backend-overview]] — startup orchestration changes from per-store init hooks to one migration runner
- [[005-data-models]] — the canonical schema now includes a `schema_migrations` ledger and migration-owned evolution rules
- [[010-deployment]] — local/dev/prod startup must fail clearly when required migrations cannot be applied

## Specification

### Migration ownership

- `ruh-backend/src/schemaMigrations.ts` is the canonical migration definition and execution module for this service.
- Migrations are ordered, backend-owned units with stable zero-padded IDs such as `0001_base_sandboxes_and_conversations`.
- Future backend schema changes must land as new ordered migrations in that module instead of adding `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, or index-creation side effects to store modules.

### Ledger table

- The backend creates a `schema_migrations` ledger table before it tries to apply feature migrations.
- The ledger stores:
  - `id` — migration identifier string, primary key
  - `applied_at` — timestamp of successful application
- A migration is considered applied only when all of its statements succeed and the ledger insert commits in the same transaction.

### Execution contract

- Backend startup runs the migration runner after the PostgreSQL pool is initialized and before the HTTP server starts listening.
- The runner reads the applied ledger state, applies pending migrations in ascending ID order, and becomes a no-op when the database is already current.
- Each migration runs inside its own transaction.
- If a migration statement fails:
  - that migration transaction rolls back
  - the migration is not inserted into `schema_migrations`
  - startup fails fast and backend readiness remains `not_ready`

### Initial migration chain

The first shipped chain reproduces the current live schema in ordered slices:

1. Base `sandboxes`, `conversations`, and `messages` tables plus required indexes
2. `agents` table and status index
3. Incremental sandbox schema additions such as `vnc_port`, `shared_codex_enabled`, and `shared_codex_model`
4. `control_plane_audit_events` table plus indexes
5. `agents.workspace_memory` JSONB column

This keeps the migration history explicit while preserving the current latest schema shape for fresh databases.

### Store-module behavior

- `store.ts`, `agentStore.ts`, `conversationStore.ts`, and `auditStore.ts` no longer own schema creation.
- Those modules remain responsible only for runtime reads, writes, normalization, and delete/update semantics.

### Test and developer workflow

- Real-DB integration bootstrap calls the migration runner directly instead of individual store `initDb()` functions.
- Local development and deployment continue to rely on automatic startup migration execution in the first shipped slice; there is no separate operator-only CLI requirement yet.
- A failed migration is a hard startup error, not a warning or partial boot.

## Implementation Notes

- Keep the first version lightweight: TypeScript-defined migrations plus SQL statement arrays are sufficient for Bun + `pg`.
- Do not broaden this slice into reversible down-migrations, out-of-band migration CLIs, or cross-service schema tooling.
- Preserve the current schema semantics, including the existing lack of a DB foreign key from `conversations.sandbox_id` to `sandboxes.sandbox_id`.

## Test Plan

- Unit tests for deterministic migration ordering, applied-ledger no-op behavior, and rollback/no-ledger-write on failure
- Startup orchestration test proving the backend waits for migration completion before listening
- Real-DB integration tests for fresh bootstrap, partial-ledger catch-up, and idempotent rerun behavior
