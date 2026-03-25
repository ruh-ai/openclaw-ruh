# Agent Learning System Design

## Goal

Define a repo-wide operating system for all agents so non-trivial runs leave behind two distinct artifacts: a date-based work journal and a reusable knowledge-base learning note when the run uncovers durable insight.

## Context

- The repo already requires KB-first orientation and `TODOS.md` updates.
- Recurring automations already use private `memory.md` files, but that memory is not a shared repo artifact.
- Core KB notes should stay canonical reference material, not slowly turn into chronological run logs.
- Active automation prompts are partially misaligned with the documented repo-local agent roles, especially the worker prompt.

## Recommended Approach

Use a three-layer agent record system:

1. `TODOS.md` remains the canonical work-state and handoff log.
2. `docs/journal/YYYY-MM-DD.md` becomes the mandatory chronological journal for every non-trivial run.
3. `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md` becomes the durable-learning layer for reusable insight.

## Why This Approach

- It keeps architectural KB notes stable and discoverable.
- It separates "what was worked on" from "what future agents should remember."
- It scales better than adding every run note to `000-INDEX.md`.
- It gives automations the same repo-visible accountability as interactive agents.

## Artifact Rules

### `TODOS.md`

- Tracks task state, ownership, blockers, and next-step handoff.
- Not a substitute for either the daily journal or durable learnings.

### Daily Journal

- Path: `docs/journal/YYYY-MM-DD.md`
- Required for every non-trivial run, interactive or automated.
- One section per run, including summary, areas touched, verification, blockers, and links to any learning notes.

### KB Learning Notes

- Path: `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md`
- Required only when the run yields durable knowledge another agent should reuse.
- Must link to the affected KB notes/specs and to the relevant daily journal entry.
- Should not be created for trivial edits or routine status churn.

## Durable Learning Decision Rule

Create a learning note when the run discovers or clarifies any of the following:

- a non-obvious root cause
- a hidden constraint or repo convention
- a contract mismatch between docs, prompts, and runtime behavior
- a reusable test or debugging pattern
- a change in how future agents should operate

Do not create a learning note for routine edits that do not change future decision-making.

## Rollout Scope

- Add a KB system note and feature spec for the learning/journal contract.
- Update the repo instructions in `CLAUDE.md`, `AGENTS.md`, and `agents.md`.
- Update the human-readable and tool-facing agent role definitions.
- Align active automation prompts and memory files under `$CODEX_HOME/automations/`.
- Seed the system with the first daily journal entry and rollout learning note.

## Guardrails

- Individual `LEARNING-*` notes should not be listed one-by-one in `000-INDEX.md`; they remain discoverable through backlinks, affected KB notes, and daily journal entries.
- Core KB notes stay canonical; they should reference learning notes instead of absorbing chronological run logs.
- Automation memory remains private continuity for a specific automation and does not replace repo-visible journal or KB learnings.
