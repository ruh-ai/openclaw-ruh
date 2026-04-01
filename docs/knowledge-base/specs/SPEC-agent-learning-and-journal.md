# SPEC: Agent Learning And Journal

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[012-automation-architecture]]

## Status

implemented

## Summary

Defines the repo-wide operating contract for how all agents, including recurring automations, leave behind reusable knowledge and chronological work history. Non-trivial runs must append a daily journal entry, while durable discoveries must be written as dedicated KB learning notes instead of being buried inside core reference notes.

## Related Notes

- [[013-agent-learning-system]] — operational guide for the artifact model, workflow, and templates
- [[012-automation-architecture]] — applies the learning/journal contract to recurring automations and their prompt patterns
- [[001-architecture]] — explains where maintainer agents fit relative to the shipped product runtime
- [[010-deployment]] — documents where automation config and memory live, distinct from repo-visible learnings and journals
- [[SPEC-analyst-project-focus]] — adds a repo-visible steering artifact that `Analyst-1` must read before focus-aware backlog curation
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package unit of work used by `Analyst-1` and `Worker-1`

## Specification

### Scope

This contract applies to all non-trivial agent runs in the repo:

- interactive agents
- repo-local maintainer agents
- scheduled Codex automations

### Required Artifacts

Every non-trivial run must leave behind:

1. An updated `TODOS.md` entry when the task is substantial enough to need handoff or state tracking
2. A journal entry in `docs/journal/YYYY-MM-DD.md`

In addition, the run must create or update a KB learning note when it produces durable knowledge another agent should reuse.

### Journal Contract

- Journal files live under `docs/journal/`
- File naming pattern: `YYYY-MM-DD.md`
- Each run appends one section including status, areas, summary, verification, learning-note link, and blockers
- Journal entries are chronological work records, not long-form specs

### Learning Note Contract

- Learning notes live under `docs/knowledge-base/learnings/`
- File naming pattern: `LEARNING-YYYY-MM-DD-<task-slug>.md`
- Learning notes are required only for durable learnings, not routine edits
- Every learning note must link to the affected KB notes/specs and the related journal entry
- Affected KB notes/specs should backlink the learning note when it materially changes future understanding

### Indexing Rule

- Standard KB notes and specs must still be added to `docs/knowledge-base/000-INDEX.md`
- Individual `LEARNING-*` notes are exempt from one-by-one listing in `000-INDEX.md`
- `[[013-agent-learning-system]]` serves as the stable entry point for the learning-note system

### Automation Contract

- Automation memory remains private continuity for a specific automation
- Automation memory does not replace repo-visible journal entries or durable learning notes
- Canonical automation prompts must explicitly require the journal step and the conditional learning-note step
- Role-backed automations such as `Analyst-1`, `Worker-1`, and `Tester-1` must also read the matching repo-local role contract before choosing work so the live prompt and written role expectations stay aligned
- When `Analyst-1` is running, the live prompt should also read `docs/project-focus.md` when present so operator-defined focus survives outside private automation memory
- When `Analyst-1` and `Worker-1` are running under the feature-at-a-time contract, `TODOS.md` should describe one feature package per run so the journal, KB, and live prompt all refer to the same unit of work

## Implementation Notes

- Added `docs/knowledge-base/013-agent-learning-system.md` as the repo entry point for the system
- Added `docs/journal/README.md` and seeded `docs/journal/2026-03-25.md`
- Updated `CLAUDE.md`, `AGENTS.md`, and `agents.md` so the contract applies to all agents
- Updated role definitions in `agents/` and `.agents/agents/`
- Updated active automation prompts under `$CODEX_HOME/automations/`, including the requirement that role-backed automations read the matching repo role file
- Extended the documented automation contract so `Analyst-1` also reads the repo-visible `docs/project-focus.md` steering artifact when it exists
- Extended the maintainer automation contract so `Analyst-1` and `Worker-1` use one feature package per run instead of isolated single-task slices

## Test Plan

- Verify `docs/knowledge-base/000-INDEX.md` links to `[[013-agent-learning-system]]` and this spec
- Verify `docs/journal/README.md` documents the daily journal format
- Verify at least one seeded `LEARNING-*` note exists and links back to the journal
- Verify active automation prompts mention `docs/journal/YYYY-MM-DD.md` and `docs/knowledge-base/learnings/`
- Verify role-backed automation prompts mention their matching `agents/*.md` file
- Verify the live `analyst-1` prompt also mentions `docs/project-focus.md`
- Verify the live `analyst-1` and `worker-1` prompts agree with the role files on the feature-package unit of work
