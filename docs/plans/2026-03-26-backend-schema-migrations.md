# Backend Schema Migrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace backend startup `initDb()` side effects with an ordered schema-migration runner and tracked ledger.

**Architecture:** Add one backend-owned migration module that defines ordered migration steps, ensures a `schema_migrations` ledger exists, and applies each pending migration inside its own DB transaction. Startup and test DB bootstrap will call the runner directly; store modules remain focused on runtime CRUD.

**Tech Stack:** Bun, TypeScript, `pg`, PostgreSQL 16, Bun test

---

### Task 1: Lock the contract in docs

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-backend-schema-migrations.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/002-backend-overview.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/knowledge-base/010-deployment.md`

**Step 1: Capture the migration contract**

- Define the ordered migration model, ledger table, startup behavior, and future-agent rule that schema changes land as migrations instead of store-local startup DDL.

**Step 2: Add KB backlinks**

- Link the new spec from the touched KB notes and the KB index.

### Task 2: Write the failing migration tests

**Files:**
- Create: `ruh-backend/tests/unit/schemaMigrations.test.ts`
- Create: `ruh-backend/tests/integration/schemaMigrations.test.ts`
- Modify: `ruh-backend/tests/helpers/db.ts`
- Modify: `ruh-backend/tests/unit/startup.test.ts`

**Step 1: Write unit tests for the runner**

- Assert deterministic migration ordering, idempotent no-op behavior, and rollback semantics when a migration statement fails.

**Step 2: Write integration tests for the real database**

- Assert fresh bootstrap creates the expected schema, partial ledger state applies only remaining migrations, and reruns do not duplicate ledger rows.

**Step 3: Verify RED**

Run: `cd ruh-backend && bun test tests/unit/schemaMigrations.test.ts tests/integration/schemaMigrations.test.ts`

Expected: failures because the migration runner and ledger do not exist yet.

### Task 3: Implement the migration runner

**Files:**
- Create: `ruh-backend/src/schemaMigrations.ts`
- Modify: `ruh-backend/src/startup.ts`
- Modify: `ruh-backend/src/db.ts`

**Step 1: Add migration definitions**

- Encode the current base schema as a small ordered migration chain that reproduces today's latest DB shape.

**Step 2: Add ledger + runner**

- Create `schema_migrations`, read applied IDs, apply pending migrations in order, and insert the ledger row only after a migration succeeds.

**Step 3: Wire startup to migrations**

- Replace per-store startup init hooks with one `runSchemaMigrations()` dependency in `startBackend()`.

### Task 4: Remove store-owned schema side effects

**Files:**
- Modify: `ruh-backend/src/store.ts`
- Modify: `ruh-backend/src/agentStore.ts`
- Modify: `ruh-backend/src/conversationStore.ts`
- Modify: `ruh-backend/src/auditStore.ts`
- Modify: `ruh-backend/tests/unit/store.test.ts`
- Modify: `ruh-backend/tests/unit/agentStore.test.ts`
- Modify: `ruh-backend/tests/unit/conversationStore.test.ts`
- Modify: `ruh-backend/tests/unit/auditStore.test.ts`

**Step 1: Delete `initDb()` from store modules**

- Keep the modules focused on CRUD and serialization only.

**Step 2: Update unit tests**

- Remove schema-creation expectations from store tests and keep behavior coverage on runtime queries.

### Task 5: Verify and document the shipped workflow

**Files:**
- Modify: `TODOS.md`
- Create or modify: `docs/journal/2026-03-26.md`
- Create or modify: `docs/knowledge-base/learnings/LEARNING-2026-03-26-backend-schema-migrations.md`

**Step 1: Run the narrow verification set**

Run: `cd ruh-backend && bun test tests/unit/schemaMigrations.test.ts tests/unit/startup.test.ts tests/integration/schemaMigrations.test.ts`

Expected: PASS

**Step 2: Update handoff artifacts**

- Record exactly what shipped, what was verified, and the rule future schema work must follow.
