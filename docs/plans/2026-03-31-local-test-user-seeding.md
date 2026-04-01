# Local Test User Seeding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an idempotent backend seed utility that creates a full local QA user matrix for platform admin, developer-org, customer-org, and employee testing.

**Architecture:** Implement one importable backend seeding module that owns the fixture definitions and writes the live auth tables directly, then expose it through a thin CLI script. Drive the behavior with integration tests first so row counts, memberships, and password rotation are proven before the seed is run against the local database.

**Tech Stack:** Bun, TypeScript, PostgreSQL, existing backend auth stores and migrations, bun:test integration tests.

---

### Task 1: Document and track the fixture feature

**Files:**
- Modify: `TODOS.md`
- Create: `docs/knowledge-base/specs/SPEC-local-test-user-seeding.md`
- Create: `docs/plans/2026-03-31-local-test-user-seeding-design.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/005-data-models.md`

**Steps:**
1. Add the active TODO entry.
2. Write the KB spec and design doc.
3. Add backlinks in the auth/data-model notes and index the new spec.

### Task 2: Write the failing integration tests

**Files:**
- Create: `ruh-backend/tests/integration/testUserSeed.test.ts`

**Steps:**
1. Write a test that seeds the fixture once and asserts expected users, orgs, memberships, and local identities.
2. Run the test to verify it fails because the seed module does not exist yet.
3. Write a second test that seeds twice and asserts no duplicate rows while the password matches the newest shared password.
4. Run the test file again and confirm the same expected failure boundary.

### Task 3: Implement the seed module

**Files:**
- Create: `ruh-backend/src/testUserSeed.ts`

**Steps:**
1. Define the fixture orgs, users, and one shared-password default.
2. Implement idempotent helpers that ensure orgs, users, memberships, and local identities.
3. Return a structured result the CLI and tests can use.
4. Run the integration test file and confirm it passes.

### Task 4: Add the CLI runner

**Files:**
- Create: `ruh-backend/scripts/seed-test-users.ts`
- Modify: `ruh-backend/package.json`

**Steps:**
1. Create the script entrypoint that loads env, initializes the DB, runs migrations, seeds the fixture, and prints the account table.
2. Add a package script for repeatable execution.
3. Run the CLI against the local DB and confirm it succeeds.

### Task 5: Ship the repo updates and verify the live data

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/journal/2026-03-31.md`
- Modify: `docs/knowledge-base/specs/SPEC-local-test-user-seeding.md`

**Steps:**
1. Mark the TODO/spec as implemented.
2. Append the daily journal entry.
3. Run:
   - `cd ruh-backend && bun test tests/integration/testUserSeed.test.ts`
   - `cd ruh-backend && bun run typecheck`
   - `cd ruh-backend && bun run seed:test-users`
4. Query the local DB or rerun the seed to confirm the fixture is present and idempotent.
