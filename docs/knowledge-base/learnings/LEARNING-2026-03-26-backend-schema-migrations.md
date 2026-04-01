# LEARNING: Backend Schema Changes Must Use Ordered Migrations

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-backend-schema-migrations]] | [[005-data-models]]

## Context

While finishing TASK-2026-03-25-23, the backend startup path and store modules were reviewed to replace scattered `initDb()` side effects with one migration-owned schema contract.

## What Was Learned

- The repo had already accumulated schema evolution in multiple places: base table creation in store modules, later `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` patches, and KB notes that assumed a stable current schema without a tracked upgrade path.
- Moving the current latest schema into an ordered migration chain is low-risk and clarifies ownership: startup runs `schemaMigrations.ts`, while store modules stay focused on runtime CRUD.
- Future DB work should extend the migration chain rather than reintroducing hidden startup DDL in `store.ts`, `agentStore.ts`, `conversationStore.ts`, or `auditStore.ts`.

## Evidence

- `ruh-backend/src/startup.ts` now runs `runSchemaMigrations()` after pool init and before `listen()`.
- `ruh-backend/src/schemaMigrations.ts` owns the ordered migration IDs plus the `schema_migrations` ledger.
- The per-store `initDb()` exports were removed, and the focused backend test suite now verifies the migration runner plus startup orchestration directly.

## Implications For Future Agents

- Any new table, column, index, or backfill in `ruh-backend` should start with a new migration entry in `schemaMigrations.ts` and a KB/spec update.
- Do not hide schema evolution inside store modules, route handlers, or one-off test setup helpers.
- Real-DB migration verification in this repo should use `TEST_DATABASE_URL`; when that variable is absent, unit coverage can still verify runner behavior but integration evidence remains intentionally skipped.

## Links

- [[002-backend-overview]]
- [[005-data-models]]
- [[010-deployment]]
- [[SPEC-backend-schema-migrations]]
- [Journal entry](../../journal/2026-03-26.md)
