# Analyst Project Focus Design

## Goal

Add a repo-visible steering mechanism for `Analyst-1` so a human can declare the current project focus and have the analyst derive the next missing requirement from that focus before falling back to general backlog analysis.

## Context

- `Analyst-1` is currently documented as a generic backlog-gap finder in [[012-automation-architecture]] and [[SPEC-automation-agent-roles]].
- The live automation prompt at `$CODEX_HOME/automations/analyst-1/automation.toml` mirrors that generic behavior and has no focus-aware prioritization input.
- The repo already requires automation behavior changes to be documented in the KB, role files, and shared instruction mirrors.

## Recommended Approach

Introduce a human-owned `docs/project-focus.md` artifact and make it part of the analyst runtime contract.

1. Humans maintain `docs/project-focus.md` with a status flag and concrete focus areas.
2. `Analyst-1` reads that file after memory, role, KB, and `TODOS.md`.
3. If the file declares an active focus, the analyst inspects the current repo state and derives the single highest-value missing requirement that advances the active focus.
4. If the file is absent, inactive, empty, or the active focus is already sufficiently covered, the analyst falls back to the existing global gap-analysis behavior.
5. The analyst does not rewrite the focus document as part of ordinary backlog curation.

## Why This Approach

- It keeps prioritization repo-visible and operator-editable instead of burying it in private automation memory.
- It preserves the analyst’s autonomy when no current focus is defined.
- It keeps the change lightweight: one new steering document plus prompt and doc alignment, without adding product runtime code.

## Guardrails

- Treat `docs/project-focus.md` as human-owned input, not an automation-owned artifact.
- Keep the analyst output contract unchanged: exactly one actionable `TODOS.md` task per run.
- When a focus exists but appears fully covered, note that in the journal and memory, then fall back instead of producing no task.
- Keep the mirrored role files, KB notes, instruction files, and live automation prompt aligned in the same change.

## Artifacts

- `docs/project-focus.md` template
- `docs/knowledge-base/specs/SPEC-analyst-project-focus.md`
- Updated automation KB/spec/instruction notes
- Updated `Analyst-1` role definitions and live automation prompt
