# Multi-Tenant Auth Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first multi-tenant auth foundation slice: organization memberships, active-org session context, and a local email/password fallback login path that works without real SSO.

**Architecture:** Extend the existing backend auth/session system additively instead of replacing it. Keep current JWT and refresh-session behavior, add tenant-aware membership/session state underneath it, then wire a local builder login/register fallback that uses the same backend contract.

**Tech Stack:** Bun, Express, PostgreSQL, Next.js 15, React 19, bun:test

---

### Task 1: Document and lock the contract

**Files:**
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Create: `docs/knowledge-base/specs/SPEC-multi-tenant-auth-foundation.md`
- Create: `docs/plans/2026-03-31-multi-tenant-auth-foundation-design.md`

**Step 1: Confirm the spec and design files exist**

Run: `test -f docs/knowledge-base/specs/SPEC-multi-tenant-auth-foundation.md && test -f docs/plans/2026-03-31-multi-tenant-auth-foundation-design.md`

Expected: exit code `0`

### Task 2: Add failing backend tests for tenant-aware auth

**Files:**
- Modify: `ruh-backend/tests/contract/authEndpoints.test.ts`
- Modify: `ruh-backend/tests/integration/authCrud.test.ts`
- Possibly create: `ruh-backend/tests/unit/organizationMembershipStore.test.ts`

**Step 1: Write contract tests for registration with org bootstrap**

Add tests for:
- `POST /api/auth/register` with `organizationName`, `organizationSlug`, `organizationKind`
- response includes `memberships`
- response includes `activeOrganization`

**Step 2: Write contract test for `POST /api/auth/switch-org`**

Add tests for:
- valid membership switch returns new active org
- invalid org switch returns `403`

**Step 3: Write integration tests**

Add tests for:
- org membership row creation
- local identity row creation
- session `active_org_id` persistence and updates

**Step 4: Run the targeted tests to verify RED**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts
```

Expected: failing tests for missing tenant-aware auth behavior

### Task 3: Add schema and store support

**Files:**
- Modify: `ruh-backend/src/schemaMigrations.ts`
- Modify: `ruh-backend/src/orgStore.ts`
- Modify: `ruh-backend/src/sessionStore.ts`
- Modify: `ruh-backend/src/userStore.ts`
- Create: `ruh-backend/src/organizationMembershipStore.ts`
- Create: `ruh-backend/src/authIdentityStore.ts`

**Step 1: Add ordered migrations**

Add additive migrations for:
- `organizations.kind`
- `organization_memberships`
- `auth_identities`
- `sessions.active_org_id`

**Step 2: Add store helpers**

Implement:
- create/list membership helpers
- create/list auth identity helpers
- session read/write helpers for `active_org_id`

**Step 3: Run targeted tests**

Run:
```bash
cd ruh-backend && bun test tests/integration/authCrud.test.ts
```

Expected: still failing until route behavior is added, but store-level tests should begin passing where applicable

### Task 4: Extend backend auth routes

**Files:**
- Modify: `ruh-backend/src/authRoutes.ts`
- Possibly modify: `ruh-backend/src/auth/middleware.ts`

**Step 1: Extend register/login response builders**

Return:
- legacy `user`
- `memberships`
- `activeOrganization`
- optional `platformRole` or compatibility metadata if needed

**Step 2: Implement local org bootstrap on register**

If org bootstrap fields are present:
- create org
- create membership
- create local auth identity
- set session `active_org_id`

**Step 3: Add `POST /api/auth/switch-org`**

Require auth, validate membership, update the current session active org.

**Step 4: Update `GET /api/auth/me`**

Return the richer session-aware response.

**Step 5: Run tests for GREEN**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts
```

Expected: passing targeted backend auth tests

### Task 5: Add builder local login fallback

**Files:**
- Modify: `agent-builder-ui/app/(auth)/authenticate/page.tsx`
- Modify: `agent-builder-ui/app/(auth)/_components/AuthButton.tsx`
- Create or modify: `agent-builder-ui/app/(auth)/_components/LocalAuthForm.tsx`
- Modify: `agent-builder-ui/app/api/user.ts`
- Modify: `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`
- Modify: `agent-builder-ui/hooks/use-user.ts`

**Step 1: Write failing builder tests**

Add tests for:
- local fallback renders when external auth URL is absent
- external redirect button remains when external auth URL is present
- local login success redirects to requested builder route

**Step 2: Run the failing builder tests**

Run:
```bash
cd agent-builder-ui && bun test app/(auth) components/auth
```

Expected: failing tests for missing local fallback behavior

**Step 3: Implement minimal local fallback**

Build a simple form supporting:
- login
- register
- optional developer-org bootstrap

Use the existing backend auth endpoints and cookie-based session behavior.

**Step 4: Update builder session bootstrap types**

Make `userApi.getCurrentUser()` and `useUserStore` tolerate the newer auth payload shape without breaking old consumers.

**Step 5: Re-run targeted builder tests**

Run:
```bash
cd agent-builder-ui && bun test
```

Expected: relevant local-auth tests pass

### Task 6: Verify and document

**Files:**
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/journal/2026-03-31.md`

**Step 1: Typecheck and run targeted verification**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts
cd agent-builder-ui && npx tsc --noEmit
cd agent-builder-ui && bun test
```

Expected: targeted suites and typecheck pass

**Step 2: Update KB notes to implemented/partial reality**

Document:
- final backend contract
- migration names
- builder local fallback behavior
- remaining gaps for real SSO and org-level entitlements

**Step 3: Append journal entry**

Record:
- what landed
- what is still pending
- how to test the local fallback path
