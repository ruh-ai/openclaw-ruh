# App Access And Org Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first production-real slice of the multi-surface tenant program: a shared session contract with explicit app access, plus fail-closed route/session gating in admin-ui, agent-builder-ui, ruh-frontend, and the Flutter app.

**Architecture:** Extend the existing multi-tenant auth foundation instead of replacing it. The backend becomes the single source of truth for active membership and app access, and each client surface consumes that contract to decide whether the current session belongs in admin, builder, or customer space.

**Tech Stack:** Bun, Express, PostgreSQL, Next.js 15/16, React 19, Flutter, Riverpod, bun:test, Jest, flutter_test

---

### Task 1: Lock the product contract in docs

**Files:**
- Create: `docs/knowledge-base/specs/SPEC-app-access-and-org-marketplace.md`
- Create: `docs/plans/2026-03-31-app-access-and-org-marketplace-design.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/009-ruh-frontend.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/015-admin-panel.md`
- Modify: `docs/knowledge-base/016-marketplace.md`
- Create: `docs/knowledge-base/018-ruh-app.md`

**Step 1: Verify the new spec and plan files exist**

Run:
```bash
test -f docs/knowledge-base/specs/SPEC-app-access-and-org-marketplace.md
test -f docs/plans/2026-03-31-app-access-and-org-marketplace-design.md
test -f docs/knowledge-base/018-ruh-app.md
```

Expected: exit code `0`

### Task 2: Write the failing backend tests for app access

**Files:**
- Modify: `ruh-backend/tests/contract/authEndpoints.test.ts`
- Modify: `ruh-backend/tests/integration/authCrud.test.ts`
- Create or modify: `ruh-backend/tests/unit/auth-app-access.test.ts`

**Step 1: Add contract coverage for auth responses**

Write tests asserting `register`, `login`, `refresh`, and `me` return:
- `activeMembership`
- `appAccess.admin`
- `appAccess.builder`
- `appAccess.customer`

**Step 2: Add cookie-auth coverage**

Write tests proving `GET /api/auth/me` succeeds with:
- bearer token
- access-token cookie

**Step 3: Add pure helper tests**

Write unit tests for app-access decisions:
- platform admin only
- developer org owner/developer
- customer org owner/admin/employee
- inactive membership
- wrong org kind

**Step 4: Run the tests and verify RED**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts tests/unit/auth-app-access.test.ts
```

Expected: failures for missing `activeMembership`, missing `appAccess`, and missing cookie-backed auth support

### Task 3: Implement the backend app-access contract

**Files:**
- Create: `ruh-backend/src/auth/appAccess.ts`
- Modify: `ruh-backend/src/auth/middleware.ts`
- Modify: `ruh-backend/src/authRoutes.ts`

**Step 1: Implement pure app-access helpers**

Add a helper that derives:
- `activeMembership`
- `appAccess`

from:
- `platformRole`
- `activeOrganization`
- `active membership role/status`

**Step 2: Accept access token cookies in auth middleware**

Allow `requireAuth` / `optionalAuth` to read the access token from:
- `Authorization: Bearer ...`
- or `req.cookies.accessToken`

**Step 3: Extend auth route responses**

Return `activeMembership` and `appAccess` from:
- `register`
- `login`
- `refresh`
- `switch-org`
- `me`

**Step 4: Re-run the backend tests and verify GREEN**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts tests/unit/auth-app-access.test.ts
```

Expected: all targeted backend tests pass

### Task 4: Write the failing builder access tests

**Files:**
- Modify: `agent-builder-ui/lib/auth/session-guard.test.ts`
- Modify: `agent-builder-ui/middleware.test.ts`
- Modify or create: `agent-builder-ui/app/api/user.test.ts`

**Step 1: Add route-guard tests**

Add tests covering:
- anonymous protected route redirects
- authenticated non-builder session is redirected after bootstrap
- developer-org session is allowed

**Step 2: Remove the assumption that local development bypasses auth**

Add a test for the middleware/session policy that fails if developer-only access is bypassed by `NODE_ENV=development`.

**Step 3: Run targeted builder tests and verify RED**

Run:
```bash
cd agent-builder-ui && bun test middleware.test.ts lib/auth/session-guard.test.ts
```

Expected: failures because builder access is still cookie-only and dev bypass still exists

### Task 5: Implement builder app gating

**Files:**
- Modify: `agent-builder-ui/middleware.ts`
- Modify: `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`
- Modify: `agent-builder-ui/lib/auth/session-guard.ts`
- Modify: `agent-builder-ui/app/api/auth.ts`
- Modify: `agent-builder-ui/app/api/user.ts`
- Modify: `agent-builder-ui/hooks/use-user.ts`

**Step 1: Remove local-development page-auth bypasses**

Delete the unconditional development bypass from:
- `middleware.ts`
- `SessionInitializationWrapper.tsx`

**Step 2: Persist app-access session data**

Extend the builder user/session types to carry:
- `activeMembership`
- `appAccess`

**Step 3: Enforce builder-only bootstrap access**

Use the backend session contract to redirect non-builder users out of the builder surface.

**Step 4: Re-run targeted builder tests and verify GREEN**

Run:
```bash
cd agent-builder-ui && bun test middleware.test.ts lib/auth/session-guard.test.ts
cd agent-builder-ui && npx tsc --noEmit
```

Expected: targeted builder tests and typecheck pass

### Task 6: Write the failing admin-ui tests

**Files:**
- Create: `admin-ui/middleware.ts`
- Create: `admin-ui/middleware.test.ts`
- Modify: `admin-ui/__tests__/login.test.tsx`
- Create or modify: `admin-ui/__tests__/session-gate.test.tsx`

**Step 1: Add middleware tests**

Cover:
- anonymous request to `/dashboard` redirects to `/login`
- `/login` stays public

**Step 2: Add session bootstrap tests**

Cover:
- non-admin session gets rejected
- admin session is allowed

**Step 3: Run admin tests and verify RED**

Run:
```bash
cd admin-ui && bun test
```

Expected: failures for missing middleware and missing session gate

### Task 7: Implement admin-ui app gating

**Files:**
- Create: `admin-ui/app/_components/AdminSessionGate.tsx`
- Create: `admin-ui/lib/auth/session.ts`
- Modify: `admin-ui/app/(auth)/login/page.tsx`
- Modify: `admin-ui/app/(admin)/layout.tsx`
- Modify: `admin-ui/app/(admin)/*.tsx` as needed

**Step 1: Add a cookie-aware login/session flow**

Keep backend login, but bootstrap admin access from `GET /api/auth/me`.

**Step 2: Enforce `appAccess.admin`**

Reject logged-in non-admin users after bootstrap and on protected routes.

**Step 3: Re-run admin tests and verify GREEN**

Run:
```bash
cd admin-ui && bun test
```

Expected: targeted admin tests pass

### Task 8: Write and implement the customer web red-green loop

**Files:**
- Create: `ruh-frontend/middleware.ts`
- Create: `ruh-frontend/middleware.test.ts`
- Create: `ruh-frontend/app/login/page.tsx`
- Create: `ruh-frontend/components/auth/CustomerSessionGate.tsx`
- Create: `ruh-frontend/lib/auth/session.ts`
- Modify: `ruh-frontend/app/layout.tsx`
- Modify: `ruh-frontend/app/page.tsx`

**Step 1: Write failing tests**

Cover:
- anonymous request redirects to `/login`
- customer session is allowed
- developer-only session is rejected

**Step 2: Implement minimal login/bootstrap shell**

Use the shared backend session contract and fail closed to `appAccess.customer`.

**Step 3: Re-run the targeted web customer tests**

Run:
```bash
cd ruh-frontend && npm test -- --runInBand
```

Expected: targeted session-gate tests pass

### Task 9: Write and implement the Flutter auth bootstrap loop

**Files:**
- Create: `ruh_app/lib/models/auth_session.dart`
- Create: `ruh_app/lib/providers/auth_provider.dart`
- Create: `ruh_app/lib/screens/auth/login_screen.dart`
- Modify: `ruh_app/lib/config/routes.dart`
- Modify: `ruh_app/lib/services/api_client.dart`
- Modify: `ruh_app/test/widget_test.dart`
- Create: `ruh_app/test/auth_provider_test.dart`

**Step 1: Write failing Flutter tests**

Cover:
- unauthenticated app opens login screen
- customer session opens the main shell
- developer-only session is denied

**Step 2: Implement minimal session bootstrap**

Persist access token, fetch `/api/auth/me`, require `appAccess.customer`, and route accordingly.

**Step 3: Re-run Flutter tests**

Run:
```bash
cd ruh_app && flutter test
```

Expected: targeted Flutter auth tests pass

### Task 10: Verify and document slice 1

**Files:**
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/009-ruh-frontend.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/015-admin-panel.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/journal/2026-03-31.md`

**Step 1: Run slice-1 verification**

Run:
```bash
cd ruh-backend && bun test tests/contract/authEndpoints.test.ts tests/integration/authCrud.test.ts tests/unit/auth-app-access.test.ts
cd agent-builder-ui && bun test middleware.test.ts lib/auth/session-guard.test.ts && npx tsc --noEmit
cd admin-ui && bun test
cd ruh-frontend && npm test -- --runInBand
cd ruh_app && flutter test
```

Expected: the new slice-1 targeted suites pass

**Step 2: Update docs to implemented reality**

Document:
- app-access contract
- removed builder auth bypass
- admin/customer route gates
- remaining later-slice work: invites, publishing, Stripe, entitlements, seats

**Step 3: Append the daily journal**

Record:
- what landed
- what remains
- how to exercise the new role/app access matrix locally
