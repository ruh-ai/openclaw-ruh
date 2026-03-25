# SPEC: Analyst Project Focus Workflow

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

## Status

implemented

## Summary

Adds a human-owned `docs/project-focus.md` steering document for the repo's analyst automation. `Analyst-1` now prioritizes missing feature packages that advance the active project focus and only falls back to autonomous backlog-gap analysis when no focus is defined or the active focus is already sufficiently covered.

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

### Fallback Rules

- Missing file, non-`active` status, or an empty `Current Focus Areas` section all trigger fallback behavior
- If the active focus already appears fully represented by current or recent tasks, the analyst should document that conclusion in the journal/memory and then choose the highest-value non-duplicate global gap instead of producing no recommendation

### Ownership Rules

- `docs/project-focus.md` is operator-owned by default
- `Analyst-1` reads this file but does not rewrite it during ordinary backlog curation
- Future automation work may introduce a separate workflow for updating project focus, but that is out of scope for this slice

## Implementation Notes

- Added `docs/project-focus.md` as the repo-visible steering template
- Updated `agents/analyst-1.md`, `.agents/agents/analyst-1.md`, and the live `analyst-1` automation prompt to enforce focus-first feature-package prioritization with fallback
- Updated [[012-automation-architecture]], [[013-agent-learning-system]], [[SPEC-agent-learning-and-journal]], [[SPEC-automation-agent-roles]], and the shared instruction files so the new behavior is documented in the same places that already govern automation prompt changes

## Test Plan

- Verify `docs/project-focus.md` exists and documents the activation/fallback rules
- Verify `agents/analyst-1.md`, `.agents/agents/analyst-1.md`, and `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml` all reference `docs/project-focus.md` and the same fallback behavior
- Verify `docs/knowledge-base/000-INDEX.md`, [[012-automation-architecture]], [[001-architecture]], [[013-agent-learning-system]], [[SPEC-agent-learning-and-journal]], and [[SPEC-automation-agent-roles]] all link to or describe this workflow
- Verify the focus-aware analyst contract describes one feature package output rather than one isolated requirement
- Validate the live TOML config parses and still contains the updated prompt text
