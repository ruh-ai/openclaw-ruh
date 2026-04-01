# SPEC: Test Coverage Automation

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

## Status

implemented

## Summary

Defines a recurring Codex automation that improves repo reliability by adding one bounded, validated test improvement per run. The automation is allowed to write tests directly when it can make a narrow change and verify it with the smallest relevant command; otherwise it must leave behind one actionable `TODOS.md` task instead of forcing a risky patch.

The automation also reads `docs/project-focus.md` when it is present so testing effort stabilizes the repo's current priority lane first, and it may occasionally spend a run on one bounded Playwright manual verification of a focus-area workflow when browser-level evidence is more valuable than another lower-layer test in that moment.

## Related Notes

- [[012-automation-architecture]] — stores the canonical prompt and repo automation operating rules
- [[001-architecture]] — distinguishes maintainer automations from product runtime services
- [[010-deployment]] — documents where automation config and memory live outside deployed services

## Specification

### Run Goal

Each run should make exactly one meaningful improvement to repo test coverage, complete one bounded Playwright manual verification of the active focus lane, or produce one concrete fallback task when direct test work is not safe.

### Required Run Sequence

1. Read `/Users/prasanjitdey/.codex/automations/<automation_id>/memory.md` if it exists
2. Read `docs/knowledge-base/000-INDEX.md` and the notes relevant to the chosen target area
3. Read `TODOS.md` and avoid duplicating active work, recent completed work, or an already documented gap
4. Read `docs/project-focus.md` when it exists and, if the focus is active, prioritize a bounded test or manual-verification target that materially stabilizes that lane
5. Inspect the current test setup and candidate source files
6. Choose one bounded target
7. Add or improve tests directly in the repo if the target can be validated safely, or run one bounded Playwright manual verification of a focus-area workflow when browser-level evidence is the best next step
8. Run the narrowest relevant verification command or record the Playwright manual-verification outcome
9. Update memory with the outcome and next-run guidance
10. Return an inbox item that summarizes the result

### Target Selection Rules

The automation should rank candidate work by reliability impact and implementation safety:

- Prefer code paths with known behavior but missing regression coverage
- Prefer existing test harnesses and neighboring test files over introducing new tooling
- Prefer unit tests before integration tests, and integration tests before E2E coverage
- When `docs/project-focus.md` is active, prefer targets that make the current focus area more stable before falling back to unrelated repo-wide coverage gaps
- Prefer targets where the verification command is narrow and deterministic
- Deprioritize areas already under active human or agent work in `TODOS.md`
- Use Playwright manual verification only for one bounded UI or workflow scenario where browser automation is the most direct way to validate the current focus area

### Allowed Changes

- Add new tests in existing test directories
- Expand nearby tests for missing branches, error handling, serialization, state transitions, or UI behavior
- Make minimal production-code adjustments only when required to create a safe test seam
- Run one bounded Playwright manual verification scenario for the active focus lane and leave behind an accurate journal or TODO artifact

### Disallowed Changes

- Broad refactors masked as test work
- New product features unrelated to enabling the test
- Multi-area sweeps in a single run
- Claims of improved coverage without running a relevant verification command

### Fallback Behavior

If the automation cannot make a safe bounded patch because the needed setup is too broad, flaky, environment-dependent, or already in progress, it must add exactly one `TODOS.md` task in the repo’s standard format describing:

- the missing test gap
- why it matters
- the files and test layer involved
- the best next step
- blockers or environment constraints

If the automation spends the run on Playwright manual verification and finds a regression that is too broad to fix or codify safely in the same run, the fallback `TODOS.md` task must also include concise browser reproduction steps.

## Implementation Notes

- `tester-template/automation.toml` and the live `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml` should use the canonical prompt from [[012-automation-architecture]]
- Automation memory should capture both successful patches and rejected targets so later runs do not repeat low-value analysis
- Inbox output should be short and operational: what changed, whether Playwright manual verification ran, or why the run fell back to a TODO

## Test Plan

- Confirm the automation config prompt includes the full analyze-patch-verify contract
- Confirm the automation config prompt includes active-focus steering via `docs/project-focus.md` plus the bounded Playwright manual-verification contract
- Confirm the automation memory file is initialized and updated with setup decisions
- Run the automation manually and verify it either:
  - adds one bounded test change and records the verification command, or
  - records one bounded Playwright verification outcome for an active focus-area workflow, or
  - adds one TODO fallback with concrete next-step guidance
