# Multi-Org Surface Switching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make one seeded multi-org account work across admin, builder, and customer surfaces while preserving active-org auth gating.

**Architecture:** Keep the backend session contract unchanged and use the existing `memberships[]` + `POST /api/auth/switch-org` flow as the tenant-selection seam. Builder and customer clients should auto-switch into an eligible org when bootstrapping or logging into the wrong tenant, then expose explicit switching in existing account/settings UI where practical.

**Tech Stack:** Bun + Express backend, Next.js web clients, Flutter/Riverpod native client, Jest, bun:test, flutter_test

---

### Task 1: Lock the seed-account contract

**Files:**
- Modify: `ruh-backend/src/testUserSeed.ts`
- Test: `ruh-backend/tests/integration/testUserSeed.test.ts`

**Step 1: Write the failing test**

- Assert `prasanjit@ruh.ai` exists in the seeded matrix with:
  - platform role `admin`
  - `acme-dev` owner membership
  - `globex` admin membership

**Step 2: Run test to verify it fails**

Run: `cd ruh-backend && bun test tests/integration/testUserSeed.test.ts`

**Step 3: Write minimal implementation**

- Add or update the seed user definition in `testUserSeed.ts`

**Step 4: Run test to verify it passes**

Run: `cd ruh-backend && bun test tests/integration/testUserSeed.test.ts`

### Task 2: Customer-web tenant auto-switch

**Files:**
- Modify: `ruh-frontend/app/login/page.tsx`
- Modify: `ruh-frontend/app/_components/CustomerSessionGate.tsx`
- Test: `ruh-frontend/__tests__/pages/LoginPage.test.tsx`
- Test: `ruh-frontend/__tests__/components/CustomerSessionGate.test.tsx`

**Step 1: Write the failing tests**

- login page retries via `/api/auth/switch-org` when login succeeds but lands on a developer org and a customer membership exists
- session gate auto-switches instead of redirecting when `/api/auth/me` returns a wrong-surface session with a customer membership

**Step 2: Run tests to verify they fail**

Run: `cd ruh-frontend && npx jest __tests__/pages/LoginPage.test.tsx __tests__/components/CustomerSessionGate.test.tsx --runInBand`

**Step 3: Write minimal implementation**

- add a small customer-membership selector helper
- call `/api/auth/switch-org` with `credentials: "include"` when customer access is recoverable

**Step 4: Run tests to verify they pass**

Run: `cd ruh-frontend && npx jest __tests__/pages/LoginPage.test.tsx __tests__/components/CustomerSessionGate.test.tsx --runInBand`

### Task 3: Builder tenant auto-switch and manual developer-org switcher

**Files:**
- Modify: `agent-builder-ui/app/api/auth.ts`
- Modify: `agent-builder-ui/app/api/user.ts`
- Modify: `agent-builder-ui/app/(platform)/_components/UserProfileSection.tsx`
- Test: `agent-builder-ui/lib/auth/tenant-switch.test.ts` or equivalent new focused test file

**Step 1: Write the failing tests**

- local builder login auto-switches into a developer org when the login response starts on a customer org but contains a developer membership
- builder session bootstrap auto-switches instead of failing when `/api/auth/me` returns a recoverable wrong-surface session

**Step 2: Run tests to verify they fail**

Run: `cd agent-builder-ui && bun test <focused test files>`

**Step 3: Write minimal implementation**

- add a builder-eligibility helper plus `switchOrganization` auth call
- reuse it in login/bootstrap
- expose developer memberships in the user dropdown for explicit switching

**Step 4: Run tests to verify they pass**

Run: `cd agent-builder-ui && bun test <focused test files>`

### Task 4: Flutter customer auto-switch and settings org switcher

**Files:**
- Modify: `ruh_app/lib/services/auth_service.dart`
- Modify: `ruh_app/lib/providers/auth_provider.dart`
- Modify: `ruh_app/lib/screens/settings/settings_screen.dart`
- Test: `ruh_app/test/services/auth_service_test.dart`
- Test: `ruh_app/test/providers/auth_provider_test.dart`
- Test: `ruh_app/test/screens/login_screen_test.dart`

**Step 1: Write the failing tests**

- login auto-switches to a customer membership when the initial login session is on a developer org
- restoreSession auto-switches when the stored session is recoverable
- settings can trigger an explicit org switch

**Step 2: Run tests to verify they fail**

Run: `cd ruh_app && flutter test test/services/auth_service_test.dart test/providers/auth_provider_test.dart test/screens/login_screen_test.dart`

**Step 3: Write minimal implementation**

- add customer-membership selection helper
- call `/api/auth/switch-org` with the current access token plus refresh token when needed
- expose switching through the account/settings section

**Step 4: Run tests to verify they pass**

Run: `cd ruh_app && flutter test test/services/auth_service_test.dart test/providers/auth_provider_test.dart test/screens/login_screen_test.dart`

### Task 5: Verify and document

**Files:**
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/009-ruh-frontend.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/journal/2026-04-01.md`
- Modify: `TODOS.md`

**Step 1: Run focused verification**

- `cd ruh-backend && bun test tests/integration/testUserSeed.test.ts`
- `cd ruh-frontend && npx jest __tests__/pages/LoginPage.test.tsx __tests__/components/CustomerSessionGate.test.tsx --runInBand`
- `cd agent-builder-ui && bun test <focused test files>`
- `cd ruh_app && flutter test test/services/auth_service_test.dart test/providers/auth_provider_test.dart test/screens/login_screen_test.dart`

**Step 2: Run type/static checks where touched**

- `cd ruh-frontend && npx tsc --noEmit`
- `cd agent-builder-ui && npx tsc --noEmit`
- `cd ruh_app && flutter analyze`

**Step 3: Update docs**

- record the surface auto-switch contract and explicit org switching entry points

