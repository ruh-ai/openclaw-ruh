# LEARNING: Backend coverage stabilization patterns

[[000-INDEX|← Index]] | [[002-backend-overview|Backend Overview]] | [[013-agent-learning-system|Agent Learning System]] | [[014-auth-system|Auth System]]

## Summary

The remaining `ruh-backend` coverage failures on 2026-04-02 were mostly not product regressions. They came from Bun shared-module mock leakage across app-backed suites plus a mismatch between Bun's text coverage summary and the LCOV totals enforced by `scripts/check-coverage.ts`.

## Durable Lessons

- Prefer query-string imports for module-under-test files when a suite mocks a shared dependency that many other suites also mock. This was required for several app-backed and store-backed backend tests to stop inheriting prior mocked modules through Bun's cache.
- App-backed suites that import `src/app.ts` should provide fuller mock baselines than the minimum needed for a single route. Partial mocks of `sandboxManager`, `docker`, `backendReadiness`, or `orgStore` can leak into unrelated suites and cause failures far away from the file that defined them.
- `sandboxManager.dockerExec` needs a stable default of `[true, "true"]` when tests exercise or indirectly hit healthy-runtime checks. Otherwise `ensureLaunchableSandboxRuntime()` can restart runtimes in tests that only intended to reuse them.
- Customer/auth contract suites were especially sensitive to partial `orgStore` mocks. If an app-backed suite defines only `getOrg`, auth registration tests can fail later because `authRoutes.ts` also needs `createOrg`.
- Some large combined runs can surface transient `ECONNRESET` failures from the test client even when the route passes in isolation. For the customer-config PATCH harness, a single retry was acceptable because the failure was client-side and not accompanied by an app-level error.

## Coverage State

- Raw Bun reporter after stabilization plus two new store suites:
  - `713 pass`, `0 fail`
  - `81.04%` lines
  - `81.54%` functions
- Packaged `bun run test:coverage` still fails because `scripts/check-coverage.ts` reads `coverage/lcov.info` and reports much lower totals (`50.47%` lines, `71.58%` functions) across the wider source set.

## Next Targets

- High-leverage remaining low-coverage modules:
  - `evalResultStore.ts`
  - `marketplaceRuntime.ts`
  - `marketplaceRoutes.ts`
  - `openspaceClient.ts`
  - `paperclipClient.ts`
  - `paperclipOrchestrator.ts`
  - `vncProxy.ts`
- If the intent is for the packaged gate to mirror Bun's text summary, inspect `coverage/lcov.info` generation and the assumptions in `scripts/check-coverage.ts` before changing thresholds.
