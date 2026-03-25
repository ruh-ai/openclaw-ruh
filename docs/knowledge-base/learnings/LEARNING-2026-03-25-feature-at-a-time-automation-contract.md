# LEARNING: Feature-at-a-time maintainer automations need one visible feature package

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The repo's live maintainer automation prompts and role files still described `Analyst-1` as adding one missing task and `Worker-1` as executing one isolated task. That contract made it easy for worker runs to stop after spec-only slices or narrow implementation fragments, which did not match the operator expectation of "run the automation and get a feature I can test."

## What Was Learned

Changing only the live automation TOMLs is not enough for this repo. The maintainer automation contract is regenerated and audited from multiple sources, so the feature-at-a-time shift had to be applied across:

- the live automation TOMLs under `$CODEX_HOME/automations/`
- the human-readable `agents/` role files
- the execution-oriented `.agents/agents/` mirror
- the KB prompt-pattern note in [[012-automation-architecture]]
- the workflow notes/specs that describe how `TODOS.md`, journals, and focus-driven backlog selection work

The durable rule is: if `Analyst-1` and `Worker-1` should behave differently at runtime, the live prompt, repo role files, KB contract, and instruction mirrors must all change in the same diff.

## Evidence

- Before this change, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml` said to add "exactly one new task" and `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml` said to execute "exactly one unblocked, high-priority task."
- Before this change, `agents/analyst-1.md`, `agents/worker-1.md`, `.agents/agents/analyst-1.md`, and `.agents/agents/worker-1.md` all described the same task-at-a-time model.
- The feature-at-a-time contract now lives in [[SPEC-feature-at-a-time-automation-contract]] and is mirrored through [[012-automation-architecture]], [[SPEC-automation-agent-roles]], [[SPEC-analyst-project-focus]], and the updated live prompts.

## Implications For Future Agents

- Treat one `TODOS.md` entry as one feature package when curating or executing work for `Analyst-1` and `Worker-1`.
- `Analyst-1` should not emit isolated chores that cannot plausibly lead to a testable outcome after one worker run.
- `Worker-1` should not treat a spec-only slice as success unless a blocker makes feature completion unsafe in the same run.
- Future automation-contract changes must update the KB, role files, live prompts, and instruction mirrors together or the repo will drift back to mixed expectations.

## Links
- [[012-automation-architecture]]
- [[013-agent-learning-system]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [[SPEC-automation-agent-roles]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-25.md)
