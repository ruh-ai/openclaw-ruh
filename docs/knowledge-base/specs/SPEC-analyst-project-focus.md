# SPEC: Analyst Project Focus Workflow

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

## Status

implemented

## Summary

Adds a human-owned `docs/project-focus.md` steering document for the repo's focus-aware maintainer automations. `Analyst-1` prioritizes missing feature packages that advance the active project focus, and `Tester-1` biases bounded coverage work or bounded Playwright manual verification toward that same active lane before either role falls back to autonomous repo-wide selection.

## Related Notes

- [[012-automation-architecture]] — defines the runtime contract and canonical prompt for the focus-aware analyst automation
- [[001-architecture]] — explains where repo automations fit in the overall system and now mentions the project-focus steering artifact
- [[013-agent-learning-system]] — keeps the shared automation workflow aligned when the analyst prompt contract changes
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package output that the focus-aware analyst now curates

## Specification

### Steering Artifact

- The repo defines a human-owned steering document at `docs/project-focus.md`
- The document should expose:
  - a `Status` field
  - a `Current Focus Areas` section
  - optional context such as desired outcomes, in-scope signals, and explicit non-goals
- The document is considered to define an active focus only when:
  - the file exists
  - `Status` is `active`
  - `Current Focus Areas` contains at least one concrete item

### Analyst-1 Selection Order

For each run, `Analyst-1` should:

1. Read automation memory if present
2. Read the matching repo-local role contract
3. Read the KB and `TODOS.md`
4. Read `docs/project-focus.md` if it exists
5. If an active focus is defined, inspect the current repo state and identify the single highest-value missing feature package that materially advances that focus
6. If no active focus is defined, or the active focus does not yield a credible missing feature package after inspecting the current repo state, fall back to the global repo-wide gap analysis contract
7. Add exactly one actionable `TODOS.md` feature entry and leave the normal journal/memory artifacts behind

### Tester-1 Selection Order

For each run, `Tester-1` should:

1. Read automation memory if present
2. Read the matching repo-local role contract
3. Read the KB and `TODOS.md`
4. Read `docs/project-focus.md` if it exists
5. If an active focus is defined, inspect the current repo state and prioritize one bounded test improvement or one bounded Playwright manual verification that materially stabilizes that active lane
6. If no active focus is defined, or the active focus has no credible bounded testing target after inspecting the current repo state, fall back to the normal repo-wide coverage-gap selection contract
7. Leave the normal journal/memory artifacts behind and add a TODO fallback only when a safe direct test change or safe manual-verification follow-up is not available

### Fallback Rules

- Missing file, non-`active` status, or an empty `Current Focus Areas` section all trigger fallback behavior
- If the active focus already appears fully represented by current or recent tasks, the analyst should document that conclusion in the journal/memory and then choose the highest-value non-duplicate global gap instead of producing no recommendation
- If the active focus exists but is already covered by active implementation work with no safe bounded testing target available, `Tester-1` should document that conclusion in journal/memory and then choose the highest-value non-duplicate repo-wide test gap instead of forcing a flaky or overlapping focus-lane run

### Ownership Rules

- `docs/project-focus.md` is operator-owned by default
- `Analyst-1` and `Tester-1` read this file but do not rewrite it during ordinary backlog curation or testing
- Future automation work may introduce a separate workflow for updating project focus, but that is out of scope for this slice

## Implementation Notes

- Added `docs/project-focus.md` as the repo-visible steering template
- Updated `agents/analyst-1.md`, `.agents/agents/analyst-1.md`, and the live `analyst-1` automation prompt to enforce focus-first feature-package prioritization with fallback
- Extended the same steering artifact to `Tester-1` so test-improvement runs can stabilize the active focus lane first, including bounded Playwright manual verification when browser-level evidence is the right next step
- Updated [[012-automation-architecture]], [[013-agent-learning-system]], [[SPEC-agent-learning-and-journal]], [[SPEC-automation-agent-roles]], [[SPEC-test-coverage-automation]], and the shared instruction files so the new behavior is documented in the same places that already govern automation prompt changes

## Test Plan

- Verify `docs/project-focus.md` exists and documents the activation/fallback rules
- Verify `agents/analyst-1.md`, `.agents/agents/analyst-1.md`, and `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml` all reference `docs/project-focus.md` and the same fallback behavior
- Verify `agents/tester-1.md`, `.agents/agents/tester-1.md`, and `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml` all reference `docs/project-focus.md`, focus-lane prioritization, and the bounded Playwright manual-verification rule
- Verify `docs/knowledge-base/000-INDEX.md`, [[012-automation-architecture]], [[001-architecture]], [[013-agent-learning-system]], [[SPEC-agent-learning-and-journal]], [[SPEC-automation-agent-roles]], and [[SPEC-test-coverage-automation]] all link to or describe this workflow
- Verify the focus-aware analyst contract describes one feature package output rather than one isolated requirement
- Validate the live TOML config parses and still contains the updated prompt text
