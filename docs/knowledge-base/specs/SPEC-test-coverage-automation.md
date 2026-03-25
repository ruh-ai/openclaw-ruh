# SPEC: Test Coverage Automation

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

## Status

implemented

## Summary

Defines a recurring Codex automation that improves repo reliability by adding one bounded, validated test improvement per run. The automation is allowed to write tests directly when it can make a narrow change and verify it with the smallest relevant command; otherwise it must leave behind one actionable `TODOS.md` task instead of forcing a risky patch.

## Related Notes

- [[012-automation-architecture]] — stores the canonical prompt and repo automation operating rules
- [[001-architecture]] — distinguishes maintainer automations from product runtime services
- [[010-deployment]] — documents where automation config and memory live outside deployed services

## Specification

### Run Goal

Each run should make exactly one meaningful improvement to repo test coverage or produce one concrete fallback task when direct test work is not safe.

### Required Run Sequence

1. Read `/Users/prasanjitdey/.codex/automations/<automation_id>/memory.md` if it exists
2. Read `docs/knowledge-base/000-INDEX.md` and the notes relevant to the chosen target area
3. Read `TODOS.md` and avoid duplicating active work, recent completed work, or an already documented gap
4. Inspect the current test setup and candidate source files
5. Choose one bounded target
6. Add or improve tests directly in the repo if the target can be validated safely
7. Run the narrowest relevant verification command
8. Update memory with the outcome and next-run guidance
9. Return an inbox item that summarizes the result

### Target Selection Rules

The automation should rank candidate work by reliability impact and implementation safety:

- Prefer code paths with known behavior but missing regression coverage
- Prefer existing test harnesses and neighboring test files over introducing new tooling
- Prefer unit tests before integration tests, and integration tests before E2E coverage
- Prefer targets where the verification command is narrow and deterministic
- Deprioritize areas already under active human or agent work in `TODOS.md`

### Allowed Changes

- Add new tests in existing test directories
- Expand nearby tests for missing branches, error handling, serialization, state transitions, or UI behavior
- Make minimal production-code adjustments only when required to create a safe test seam

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

## Implementation Notes

- `tester-template/automation.toml` should use the canonical prompt from [[012-automation-architecture]]
- Automation memory should capture both successful patches and rejected targets so later runs do not repeat low-value analysis
- Inbox output should be short and operational: what changed or why the run fell back to a TODO

## Test Plan

- Confirm the automation config prompt includes the full analyze-patch-verify contract
- Confirm the automation memory file is initialized and updated with setup decisions
- Run the automation manually and verify it either:
  - adds one bounded test change and records the verification command, or
  - adds one TODO fallback with concrete next-step guidance
