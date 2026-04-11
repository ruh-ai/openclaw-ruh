# Testing Strategy — Ruh.ai Platform

> How we prevent regressions and ensure quality across all services.

---

## Test Pyramid

```
         /\
        / E2E \        Playwright — critical user flows (slow, main/dev only)
       /--------\
      / Contract  \     API shape validation — prevents frontend/backend drift
     /--------------\
    /  Integration    \  Real database — auth flows, CRUD operations
   /--------------------\
  /      Unit Tests       \  Fast, isolated — every function and component
 /--------------------------\
```

**Philosophy:** Unit tests are the foundation. Every new feature needs unit tests. Contract tests guard API boundaries. E2E tests cover critical user journeys. Integration tests validate real database behavior.

---

## Quick Reference

### Run all tests
```bash
npm run test:all        # All services, unit + contract tests
npm run typecheck:all   # TypeScript check across all services
```

### Per-service commands

| Service | Unit Tests | E2E Tests | Coverage |
|---------|-----------|-----------|----------|
| `ruh-backend` | `cd ruh-backend && bun test tests/unit/` | `bun test tests/e2e/` | `bun run test:coverage` |
| `agent-builder-ui` | `cd agent-builder-ui && bun test lib/ hooks/ app/` | `npx playwright test` | `bun test --coverage` |
| `ruh-frontend` | `cd ruh-frontend && npx jest` | `npx playwright test` | `npx jest --coverage` |
| `admin-ui` | `cd admin-ui && bun test` | — | `bun test --coverage` |
| `marketplace-ui` | `cd packages/marketplace-ui && bun test` | — | `bun test --coverage` |

---

## Coverage Thresholds

| Service | Lines | Functions | Enforced | Notes |
|---------|-------|-----------|----------|-------|
| ruh-backend | 90% | 90% | CI + script | Filters files <10% as untested transitive imports |
| agent-builder-ui | 90% | 90% | CI + script | Filters files <15% as untested transitive imports |
| ruh-frontend | 90% | 90% | jest.config | Branch threshold remains 50% |
| admin-ui | 90% | 90% | CI + script | |
| marketplace-ui | 90% | 90% | CI + script | |

Coverage is enforced by `scripts/check-coverage.ts` in each service, which reads LCOV output and exits non-zero if below threshold. Backend and agent-builder-ui filter out files below a minimum coverage percentage (transitive imports that bun instruments but were never intentionally tested).

---

## Test Runners

| Service | Unit Runner | Why |
|---------|------------|-----|
| ruh-backend | `bun:test` | Native Bun, fast, no config needed |
| agent-builder-ui | `bun:test` | Matches backend pattern, fast |
| ruh-frontend | Jest + jsdom | Legacy, has MSW integration |
| admin-ui | `bun:test` + happy-dom | Matches agent-builder pattern |
| marketplace-ui | `bun:test` + happy-dom | Package, minimal deps |

E2E: Playwright across all frontends.

---

## Contract Tests

**Location:** `ruh-backend/tests/contract/`

Contract tests validate that API response shapes match what frontends expect. They use supertest to hit real Express routes with mocked data stores, then assert field names and types.

**What they catch:**
- Backend renames a field -> contract test fails
- Backend changes response structure -> contract test fails
- Backend removes an endpoint -> contract test fails

**Files:**
- `authEndpoints.test.ts` — register/login/refresh response shapes
- `marketplaceListings.test.ts` — listings browse/detail/categories shapes
- `adminEndpoints.test.ts` — stats/users response shapes

---

## Pre-commit & Pre-push Hooks

Hooks are managed by Husky and run automatically.

### Pre-commit (fast, <10s)
- Typechecks only the service(s) with staged files
- Blocks commit if TypeScript errors are found
- **Bypass:** `git commit --no-verify` (use sparingly)

### Pre-push (thorough, 10-30s)
- Runs unit tests for service(s) with changed files
- Blocks push if tests fail
- **Bypass:** `git push --no-verify`

### Setup
```bash
npm install  # Installs husky via prepare script
```

---

## CI Pipeline

```
push/PR
  |-- backend-build --> backend-fast (unit+contract+security)
  |                  \-> backend-integration (real Postgres)
  |-- frontend-build --> frontend-test (Jest+coverage)
  |                   \-> frontend-e2e (Playwright, main/dev)
  |-- agent-builder-build --> agent-builder-test (unit+coverage)
  |                        \-> agent-builder-e2e (Playwright, main/dev)
  |-- admin-ui-test (unit+coverage)
  |-- marketplace-ui-test (unit+coverage)
  \-- docker (depends on all above)
```

All test jobs must pass before Docker build. E2E tests run only on main/dev branches.

---

## Writing New Tests

### Backend unit test (bun:test)
```typescript
import { describe, expect, test, mock } from "bun:test";

describe("myFunction", () => {
  test("does the thing", () => {
    expect(myFunction("input")).toBe("output");
  });
});
```

### React component test (bun:test + happy-dom)
```typescript
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  test("renders title", () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
```

### Contract test (supertest)
```typescript
import { describe, expect, test } from "bun:test";
import request from "supertest";
import { createApp } from "../../src/app";

describe("GET /api/my-endpoint", () => {
  test("response has required fields", async () => {
    const res = await request(app).get("/api/my-endpoint");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(typeof res.body.id).toBe("string");
  });
});
```

---

## Coverage Report

Run coverage across all services with enforcement:

```bash
npm run coverage:all      # Run all coverage checks (fails if below threshold)
npm run coverage:report   # Summary output only
```

Per-service coverage:
```bash
npm run coverage:backend        # 75% threshold
npm run coverage:agent-builder  # 60% threshold
npm run coverage:frontend       # 60% threshold (via Jest)
npm run coverage:admin          # 50% threshold
npm run coverage:marketplace    # 80% threshold
```

Each service has `scripts/check-coverage.ts` that reads `coverage/lcov.info` (generated by `bun test --coverage --coverage-reporter=lcov`) and exits non-zero if below its threshold. ruh-frontend uses Jest's built-in `coverageThreshold` in `jest.config.ts`.

### How enforcement works

1. `bun test --coverage --coverage-reporter=lcov` generates `coverage/lcov.info`
2. `scripts/check-coverage.ts` parses LCOV counters (LH/LF for lines, FNH/FNF for functions)
3. If either metric is below the threshold, the script exits with code 1
4. CI fails the job, blocking merge

### Ratchet history

- **Q2 2026:** All services raised to 90% lines and 90% functions
- Coverage must never decrease — any PR that drops coverage below 90% is blocked by CI

---

## Test Lifecycle Process

Tests are living artifacts. They must be added with new features and removed when they become stale. This section defines the process.

### When to add tests

Every PR that changes source code MUST include corresponding test changes:

| Change type | Required tests |
|-------------|---------------|
| New backend endpoint | Unit test (mock store) + contract test (response shape) |
| New React component | Unit test (render + key interactions) |
| New utility/helper function | Unit test (happy path + edge cases) |
| Bug fix | Regression test that reproduces the bug before fixing |
| Database schema change | Integration test (real Postgres) |
| Critical user flow change | E2E spec (Playwright) |

### When to remove tests

Tests become stale when the code they test no longer exists or has fundamentally changed. Remove tests when:

1. **The source file/function was deleted** — the test is orphaned
2. **The API was redesigned** — old contract tests no longer match
3. **The feature was removed** — tests for it are dead weight
4. **The test mocks the thing it's testing** — it validates the mock, not the code
5. **The test has no assertions** — it runs code but verifies nothing

### Automated test hygiene

**Audit script** — detects orphaned imports, stale mocks, and assertion-free tests:
```bash
bun run scripts/audit-tests.ts          # Report issues
bun run scripts/audit-tests.ts --fix    # Auto-remove orphaned files
```

Run this monthly or before major releases. It checks:
- Test imports that resolve to non-existent source files
- `mock.module()` calls targeting deleted modules
- `test()` blocks with no `expect()`, `assert()`, or `.toThrow()` calls

**Coverage enforcement** — prevents coverage from dropping:
```bash
npm run coverage:all    # Fails if any service drops below 90%
```

### PR checklist for test changes

Before merging any PR, verify:

- [ ] New source files have corresponding test files
- [ ] Modified functions have updated test cases
- [ ] Deleted source files have their tests removed
- [ ] No test uses `--no-verify` to bypass hooks
- [ ] Coverage threshold still passes: `npm run coverage:all`
- [ ] `bun run scripts/audit-tests.ts` reports no new issues

### Pre-push hook enforcement

The existing pre-push hook (`/.husky/pre-push`) runs unit tests for changed services. This catches:
- New code that breaks existing tests
- Modified tests that no longer pass
- Coverage regressions (when integrated with coverage check)

### Keeping mocks in sync

When a source module's exports change:
1. Update every `mock.module()` that references it
2. Run `bun run scripts/audit-tests.ts` to catch stale mocks
3. Update contract tests if API shapes changed

### Test file naming and location

| Service | Convention | Example |
|---------|-----------|---------|
| ruh-backend | `tests/unit/<category>/<module>.test.ts` | `tests/unit/stores/agentStore.test.ts` |
| agent-builder-ui | `<source-file>.test.ts` alongside source | `lib/openclaw/plan-formatter.test.ts` |
| ruh-frontend | `__tests__/<category>/<Component>.test.tsx` | `__tests__/components/ChatPanel.test.tsx` |
| admin-ui | `__tests__/<page>.test.tsx` | `__tests__/agents.test.tsx` |
| marketplace-ui | `src/<dir>/__tests__/<file>.test.tsx` | `src/components/__tests__/AgentCard.test.tsx` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `bun test` DOM errors | Add `[test] environment = "happy-dom"` to `bunfig.toml` |
| Jest ESM import errors | Check `jest.config.ts` transform settings |
| Playwright browser not found | Run `npx playwright install chromium` |
| Pre-commit hook not running | Run `npm install` in repo root to init husky |
| Coverage below threshold | Write more tests or adjust threshold in `scripts/check-coverage.ts` |
| Mock bleed between test files | Use `beforeEach(() => mock.restore())` |
