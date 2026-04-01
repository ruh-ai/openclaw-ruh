# Coverage Program Design

## Goal

Define a long-horizon testing program that takes this repo from a partially broken 59.21% line / 70.89% function aggregate baseline to a high-confidence state where critical business logic is near-fully covered and repo-wide coverage is sustainably above 90%.

## Current Baseline

Measured on 2026-03-31 from fresh `lcov.info` output:

| Service | Lines | Functions | Current state |
|---|---:|---:|---|
| `ruh-backend` | 50.55% | 67.74% | Failing tests and below threshold |
| `agent-builder-ui` | 59.96% | 76.18% | Just below line threshold; Bun coverage loads Playwright specs |
| `ruh-frontend` | 72.15% | 50.79% | Fails Jest global function threshold |
| `admin-ui` | 77.75% | 61.36% | Coverage is healthy, but Bun coverage loads Playwright specs |
| `@ruh/marketplace-ui` | 99.42% | 100.00% | Healthy |
| **Repo aggregate** | **59.21%** | **70.89%** | Not a reliable gate yet |

## Recommended Approach

Use a four-phase reliability-first program instead of chasing a raw number immediately:

1. Make coverage measurement trustworthy
2. Get every service green at its current threshold
3. Push the highest-leverage modules service-by-service
4. Ratchet thresholds and automate one bounded improvement at a time

## Why This Approach

- The current repo does not have a meaningful single “coverage number” because multiple service coverage commands fail before they can serve as a release gate.
- Literal 100% across UI shells and orchestration glue usually creates brittle tests and weak signal.
- The largest current risks are concentrated in backend route/orchestration code, the builder transport and wizard flow, and the ruh-frontend chat/panel surfaces.
- This repo already has a bounded `Tester-1` automation contract in [[SPEC-test-coverage-automation]], so the steady-state should be incremental ratchets, not one giant unreviewable test dump.

## Target Model

- Pure logic, stores, parsers, validators, serializers, reducers: 95-100%
- API route behavior and orchestration helpers: 90-95%
- UI components, hooks, and page shells: 80-90%, with critical workflows backed by focused browser evidence
- Repo-wide sustained goal: 90%+ lines and 90%+ functions
- Selected critical modules pushed to 98-100% where behavior is stable and deterministic

## Phases

### Phase 0: Trustworthy Measurement

- Stop Bun coverage from ingesting Playwright `e2e/*.spec.ts` files in `agent-builder-ui` and `admin-ui`
- Repair currently red coverage suites so `npm run coverage:all` reflects real regressions instead of harness issues
- Normalize root reporting so the aggregate summary is reproducible

### Phase 1: Green the Current Gates

- Bring `ruh-backend` to at least 75% lines / 75% functions
- Bring `agent-builder-ui` above 60% lines without padding coverage
- Bring `ruh-frontend` above 60% functions
- Keep `admin-ui` green after harness cleanup

### Phase 2: High-Leverage Module Push

- Backend: `app.ts`, `authRoutes.ts`, `costRoutes.ts`, `marketplaceRoutes.ts`, `docker.ts`, `sandboxManager.ts`, stores without tests
- Builder: `lib/openclaw/api.ts`, AG-UI transport, create-flow state/review/build surfaces
- Frontend: `MissionControlPanel.tsx`, `CronsPanel.tsx`, `ChatPanel.tsx`, `HomePage.test.tsx`

### Phase 3: Ratchet and Maintenance

- Raise thresholds in small increments once each service remains green
- Require each code change to leave the touched area with better coverage than it had before
- Use the repo’s bounded tester automation to keep landing one explainable improvement per run

## Guardrails

- Do not game coverage with assertions that only execute code paths without validating behavior
- Prefer unit tests before integration tests, and integration tests before end-to-end/browser tests
- Only refactor production code when a minimal seam is necessary to make tests deterministic
- Keep each patch scoped to one bounded surface area
- Preserve the repo’s KB, `TODOS.md`, and journal discipline as the long-running program advances

## Milestones

- **M1:** `coverage:all` is deterministic and trustworthy
- **M2:** Every service passes its current enforced threshold
- **M3:** Repo aggregate exceeds 80% lines and 85% functions
- **M4:** Repo aggregate exceeds 90% lines and 90% functions
- **M5:** Selected high-risk backend and builder modules are effectively near-fully covered
