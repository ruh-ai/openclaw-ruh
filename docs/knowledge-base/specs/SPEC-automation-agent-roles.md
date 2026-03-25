# SPEC: Automation Agent Roles

[[000-INDEX|← Index]] | [[012-automation-architecture]] | [[001-architecture]]

## Status

implemented

## Summary

Defines repo-local role contracts for the recurring maintainer agents `Analyst-1`, `Worker-1`, and `Tester-1`. The repo now stores these contracts in both a visible `agents/` catalog for humans and a hidden `.agents/agents/` mirror for local agent tooling, with an explicit rule that both copies must stay aligned and that every role follows the repo-wide journal and durable-learning workflow. `Analyst-1` also honors a human-owned `docs/project-focus.md` steering document when it is active, and the maintainer contract now treats one `TODOS.md` entry as one feature package for analyst and worker runs.

## Related Notes

- [[012-automation-architecture]] — explains where maintainer automations fit and now points to the repo-local agent contracts
- [[001-architecture]] — distinguishes maintainer agents from product runtime services
- [[013-agent-learning-system]] — defines the shared journal and durable-learning requirements all roles must follow
- [[SPEC-analyst-project-focus]] — defines the active-focus artifact and fallback rules that extend the `Analyst-1` role
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package unit of work for `Analyst-1` and `Worker-1`

## Specification

### Folder Layout

- `agents/` is the human-readable catalog of repo-local maintainer agents
- `.agents/agents/` is the tool-facing mirror for local agent tooling conventions
- Every role defined in one directory must have a matching role definition in the other directory

### Initial Agent Set

#### `Analyst-1`

- Reads the KB, `TODOS.md`, and relevant code
- Reads `docs/project-focus.md` when it exists
- Identifies exactly one missing high-value feature package, prioritizing the active project focus when one is defined
- Adds exactly one actionable `TODOS.md` feature entry with the outcome, implementation outline, tests, and completion criteria needed for another agent to implement the full feature
- Appends a dated journal entry for the run
- Writes a KB learning note when the analysis produces durable repo insight
- Falls back to general repo-wide gap analysis when no focus is defined or the active focus is already sufficiently covered
- Does not implement the work directly

#### `Worker-1`

- Selects one unblocked, high-priority feature package from `TODOS.md`
- Completes that feature package end-to-end across the necessary files and services inside the feature boundary
- Verifies the feature outcome at the narrowest useful level that proves it is testable
- Appends a dated journal entry for the run
- Writes a KB learning note when the implementation reveals durable insight
- Updates `TODOS.md` and the KB when required

#### `Tester-1`

- Selects one bounded test-coverage gap
- Prefers unit tests before broader layers
- Adds or improves tests directly when safe
- Appends a dated journal entry for the run
- Writes a KB learning note when the test work reveals durable insight
- Falls back to one concrete `TODOS.md` task when direct test work is unsafe

### Runtime Binding Rule

- The live automation with id `analyst-1` must explicitly read `agents/analyst-1.md` (or `.agents/agents/analyst-1.md`) before choosing work
- The live automation with id `worker-1` must explicitly read `agents/worker-1.md` (or `.agents/agents/worker-1.md`) before choosing work
- The live automation with id `tester-1` must explicitly read `agents/tester-1.md` (or `.agents/agents/tester-1.md`) before choosing work
- Matching names alone are insufficient; the runtime prompt must load the repo role contract so the written role and live behavior do not drift apart

### Sync Rule

When any repo-local maintainer agent role changes:

1. Update the matching files in `agents/` and `.agents/agents/`
2. Update the matching live automation prompt under `$CODEX_HOME/automations/<role>/automation.toml` if that role has a scheduled automation
3. Update this spec if the contract changes materially
4. Update [[012-automation-architecture]] if automation expectations or prompt contracts also change

## Implementation Notes

- `agents/README.md` summarizes the human-facing catalog
- `.agents/agents/*.md` uses concise frontmatter plus execution-oriented instructions
- The role definitions describe operator-layer behavior only; they do not add product runtime features
- Active automation prompts under `$CODEX_HOME/automations/` should be kept aligned with these role contracts and explicitly reference the matching role file
- `Analyst-1` now depends on the repo-visible `docs/project-focus.md` artifact when a human wants to steer backlog discovery explicitly
- `Analyst-1` and `Worker-1` now share a feature-at-a-time contract: one curated feature package, one feature-complete worker run

## Test Plan

- Verify `agents/` contains `README.md`, `analyst-1.md`, `worker-1.md`, and `tester-1.md`
- Verify `.agents/agents/` contains matching role definitions
- Verify live prompts under `$CODEX_HOME/automations/analyst-1/`, `$CODEX_HOME/automations/worker-1/`, and `$CODEX_HOME/automations/tester-1/` explicitly reference their matching role file
- Verify [[000-INDEX]], [[001-architecture]], [[012-automation-architecture]], and [[013-agent-learning-system]] link to this spec
- Verify the `Analyst-1` role files and live automation prompt all mention `docs/project-focus.md` and the fallback behavior
- Verify the `Analyst-1` and `Worker-1` role files plus live prompts all describe one feature package per run rather than one isolated task per run
