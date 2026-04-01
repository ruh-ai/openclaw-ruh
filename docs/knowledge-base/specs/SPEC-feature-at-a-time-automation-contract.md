# SPEC: Feature-At-A-Time Automation Contract

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[SPEC-automation-agent-roles]]

## Status

implemented

## Summary

Changes the maintainer automation contract so `Analyst-1` curates one complete feature package at a time and `Worker-1` completes one whole feature package at a time. The new contract keeps the safety boundary of "one thing per run" but redefines that thing as one user-testable or operator-testable feature rather than one isolated TODO task or one partial implementation slice.

## Related Notes

- [[012-automation-architecture]] — owns the canonical prompt patterns and runtime expectations for the maintainer automations
- [[013-agent-learning-system]] — keeps the TODO, journal, learning-note, and prompt-alignment workflow consistent with the new feature unit of work
- [[001-architecture]] — explains where repo-maintainer automations fit relative to the shipped product runtime
- [[SPEC-automation-agent-roles]] — defines the mirrored repo-local role contracts that now follow this feature-package model
- [[SPEC-analyst-project-focus]] — explains how active focus areas steer which feature package `Analyst-1` should recommend
- [[SPEC-agent-learning-and-journal]] — ensures the journal and learning-note layer refers to the same unit of work

## Specification

### Unit Of Work

- For `Analyst-1` and `Worker-1`, one run should operate on exactly one feature package.
- A feature package is one bounded piece of work that can produce a user-testable or operator-testable outcome when completed.
- The feature package may span multiple files, modules, or services as long as all changes stay inside that feature boundary.

### Analyst-1 Output Contract

`Analyst-1` should:

- inspect the KB, `TODOS.md`, relevant code, and `docs/project-focus.md` when present
- choose exactly one missing feature package that materially improves user value, reliability, security, or an active focus area
- write exactly one `TODOS.md` entry that makes the feature directly implementable by another agent

The entry should include:

- the normal top-level metadata fields already used in `TODOS.md`
- a clear user-testable or operator-testable outcome
- the implementation outline or ordered phases inside the feature
- the expected verification steps
- the evaluation or completion criteria that define "feature is done"

`Analyst-1` should not emit isolated chores that cannot plausibly produce a testable outcome after one worker run.

### Worker-1 Execution Contract

`Worker-1` should:

- choose exactly one unblocked feature package from `TODOS.md`
- read the relevant KB notes and specs for that feature
- create or update the feature spec when needed as part of the same run
- continue through implementation, verification, KB updates, and handoff in the same run

The worker may:

- cross backend, frontend, docs, and config boundaries inside the chosen feature package
- add the tests or documentation needed to make the feature shippable and testable

The worker must not:

- broaden into unrelated cleanup or a second feature package
- treat a spec-only slice as success unless a real blocker makes feature completion unsafe in the same run

### Handoff And Blockers

- If the feature is completed, `TODOS.md` should say so and record how to test it.
- If the feature is blocked, `TODOS.md`, the journal entry, and automation memory should explain the blocker and the exact best next step.
- The worker should leave enough context that the next run can resume the same feature package without reconstructing intent.

### Alignment Rule

When this contract changes, update all of the following in the same diff:

- the live automation prompts under `$CODEX_HOME/automations/`
- `agents/` and `.agents/agents/`
- [[012-automation-architecture]]
- [[013-agent-learning-system]]
- `CLAUDE.md` and `agents.md`

## Implementation Notes

- Added a dedicated spec for the feature-at-a-time automation model instead of burying the behavior change inside the older role or focus specs
- Updated the canonical feature-add and implementation-worker prompts in [[012-automation-architecture]]
- Updated the mirrored `Analyst-1` and `Worker-1` role files plus the live automation TOMLs so runtime behavior and written repo policy stay aligned
- Updated `docs/project-focus.md` so operator-provided focus areas now steer feature-package curation, not isolated requirements

## Test Plan

- Verify [[000-INDEX]] links to this spec
- Verify [[012-automation-architecture]], [[013-agent-learning-system]], [[SPEC-automation-agent-roles]], [[SPEC-analyst-project-focus]], and [[SPEC-agent-learning-and-journal]] all link to or describe this contract
- Verify `agents/analyst-1.md`, `agents/worker-1.md`, `.agents/agents/analyst-1.md`, and `.agents/agents/worker-1.md` all describe one feature package per run
- Verify `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml` and `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml` both parse and contain the updated feature-oriented prompts
