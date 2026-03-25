# Feature-At-A-Time Automation Contract Design

## Goal

Change the repo's maintainer automation model so `Analyst-1` curates one complete, user-testable feature package at a time and `Worker-1` executes one complete feature at a time instead of stopping at isolated TODO tasks or spec-only slices.

## Context

- The current repo contract in `agents/`, `.agents/agents/`, `docs/knowledge-base/012-automation-architecture.md`, and the live automation TOMLs all describe `Analyst-1` as adding one missing task and `Worker-1` as implementing one task.
- That contract encourages partial delivery: spec-only slices, single-route changes, or one backend helper without the user-facing feature being testable end-to-end after a run.
- The user wants each run to bias toward "here is a feature you can go test" rather than "here is one more backlog task or one more implementation slice."

## Approaches

### 1. Group existing task entries by shared feature label

- Keep the current TODO entry shape.
- Add a feature label or ID to multiple task entries.
- Teach `Worker-1` to stitch the grouped tasks together at runtime.

Trade-offs:

- Minimal document-format change.
- Higher runtime ambiguity because the worker still has to reconstruct feature scope from multiple separate entries.
- Easier for the analyst to under-specify the real user outcome.

### 2. Introduce feature-package TODO entries and make the worker finish the whole package

- Change `Analyst-1` so it creates one feature entry that includes:
  - the user-testable outcome
  - the affected areas
  - the implementation sequence
  - verification requirements
  - completion criteria
- Change `Worker-1` so it selects one unblocked feature entry and is explicitly allowed to span multiple files and services within that feature boundary.
- Keep the "one thing at a time" safety rule, but redefine "thing" as one feature package instead of one isolated task.

Trade-offs:

- Clearer operator expectation and cleaner handoff.
- Requires coordinated updates to the repo docs, specs, agent role files, and live TOMLs.
- Best fit for the user's request because the feature boundary is visible in `TODOS.md`.

### 3. Make specs the only feature boundary and keep TODOs lightweight

- Tell `Analyst-1` to create or expand a spec and only add a short TODO pointer.
- Tell `Worker-1` to choose a spec and complete it.

Trade-offs:

- Strong spec discipline.
- Weaker backlog readability because `TODOS.md` no longer carries enough detail on its own.
- Not ideal here because the repo instructions explicitly treat `TODOS.md` as the canonical work log.

## Recommendation

Use Approach 2.

It keeps `TODOS.md` as the canonical operating artifact while making the unit of work large enough to produce a user-testable outcome. It also preserves the repo's safety model because the worker is still bounded to one feature package per run rather than broad repo-wide cleanup.

## Design

### Feature-Oriented TODO Contract

For `Analyst-1` and `Worker-1`, the selected `TODOS.md` item should now represent one feature package rather than one isolated task. Each new analyst-created entry should describe:

- the user-visible or operator-visible outcome
- why the feature matters
- the concrete areas/files likely involved
- the ordered implementation tasks or phases inside the feature
- the verification plan
- the "feature is done when" criteria

The entry can still use the repo's existing top-level metadata fields, but the body should make it possible for `Worker-1` to execute the full feature without inventing scope.

### Analyst-1 Contract

`Analyst-1` should:

- prioritize one feature package that materially improves the active focus area or, if no focus is active, the highest-value repo gap
- avoid isolated chores that do not lead to a testable outcome
- write the feature entry so it includes a complete implementation path, not just one missing task
- continue creating journal and learning artifacts when appropriate

### Worker-1 Contract

`Worker-1` should:

- select one unblocked feature package from `TODOS.md`
- create or update the KB spec for that feature as part of the same run when needed
- implement the feature end-to-end across all necessary services/files within that feature boundary
- run the narrowest verification that proves the whole feature is testable
- stop early only for a real blocker, then leave a high-quality handoff

This removes the old "spec-only slice counts as success" behavior for worker runs unless the feature is genuinely blocked after the spec step.

### Documentation And Runtime Alignment

Because the repo requires prompt-contract changes to be mirrored, the change must land in:

- the live automation TOMLs under `$CODEX_HOME/automations/`
- `agents/` and `.agents/agents/`
- `docs/knowledge-base/012-automation-architecture.md`
- `docs/knowledge-base/013-agent-learning-system.md`
- the affected specs and index entries
- `CLAUDE.md` and `agents.md`

### Non-Goals

- Do not change `Tester-1` in this slice.
- Do not redesign the entire `TODOS.md` file format for every repo task; only document the feature-package expectations for the Analyst/Worker automation path.
