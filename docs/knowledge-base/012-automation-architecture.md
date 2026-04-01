# Automation Architecture

[[000-INDEX|← Index]] | [[001-architecture]] | [[010-deployment]] | [[013-agent-learning-system]]

---

## Overview

This repo uses Codex desktop automations as a maintenance layer on top of the codebase. They are not part of the shipped Ruh.ai product runtime. Instead, they run on a schedule or manually, inspect the current repo state, update bounded files such as `TODOS.md` or knowledge-base notes, append a repo-visible daily journal entry, and return an inbox-item summary for a human operator.

For the maintainer roles `Analyst-1` and `Worker-1`, the unit of work is now one feature package per run rather than one isolated task. `Analyst-1` curates the feature package in `TODOS.md`, and `Worker-1` is expected to carry that feature to a user-testable or operator-testable outcome unless a real blocker prevents completion.

---

## Where Automation State Lives

- Automation config: `$CODEX_HOME/automations/<automation_id>/automation.toml`
- Automation memory: `$CODEX_HOME/automations/<automation_id>/memory.md`
- Repo-local role contracts: `agents/*.md` mirrored to `.agents/agents/*.md`
- Focus steering artifact: `docs/project-focus.md`
- Repo-facing work products: `TODOS.md`, `docs/knowledge-base/`, `docs/knowledge-base/learnings/`, `docs/journal/`, and any code/docs files the automation was explicitly designed to maintain

The memory file is the continuity layer between runs. Each run should read it first if present, avoid duplicating prior analysis, and write a concise summary of what changed or what decision was made before returning.

---

## Expected Run Shape

An automation run in this repo should usually follow this sequence:

1. Read the matching repo-local role contract first when the automation is `Analyst-1`, `Worker-1`, or `Tester-1`
2. Read `docs/knowledge-base/000-INDEX.md` and the most relevant linked notes
3. Read `TODOS.md` before making any non-trivial decision or edit
4. When the automation is `Analyst-1` or `Tester-1`, read `docs/project-focus.md` if it exists before choosing work
5. Inspect the current repo state relevant to the automation goal
6. Make one bounded, explainable update
7. Decide whether the run produced a durable learning
8. If yes, create or update a note under `docs/knowledge-base/learnings/`
9. Update the KB if the automation changes repo behavior or agent expectations
10. Append an entry to `docs/journal/YYYY-MM-DD.md`
11. Update automation memory with the run outcome
12. Return an inbox item that tells the operator what changed or what needs attention

This keeps automation runs aligned with the same handoff discipline expected of interactive agents.

---

## Automation Design Rules

- Prefer narrow automations with one stable responsibility
- Anchor decisions in current repo state, not stale assumptions
- Update `TODOS.md` in the repo's required format when the automation adds or changes agent work
- For `Analyst-1` and `Worker-1`, keep the run bounded to one complete feature package rather than many unrelated tasks
- Prefer feature packages that lead to a user-testable or operator-testable outcome after a successful worker run
- Append a daily journal entry for every non-trivial run
- Only create a KB learning note when the run produces durable insight another agent should reuse
- Treat `docs/project-focus.md` as human-owned steering input for focus-aware maintainer automations; `Analyst-1` uses it to prioritize missing feature packages and `Tester-1` uses it to prioritize coverage or manual validation that stabilizes the active lane. Do not overwrite it unless a human explicitly asks
- Do not invent product behavior; document only what the codebase, KB, and backlog support
- If an automation edits instructions or KB notes, keep Obsidian `[[wikilinks]]` intact and update `[[000-INDEX]]`

## Repo Journal And Learnings

All recurring automations follow the same shared learning contract as interactive agents; see [[013-agent-learning-system]].

- `docs/journal/YYYY-MM-DD.md` is mandatory for every non-trivial run
- `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md` is required when the run uncovers durable knowledge
- `memory.md` remains private continuity for that automation and does not replace those repo-visible artifacts

## Repo-Local Agent Definitions

This repo keeps named maintainer-agent role contracts in two places:

- `agents/` — human-readable catalog
- `.agents/agents/` — tool-facing mirror for local agent tooling

These folders currently define `Analyst-1`, `Worker-1`, and `Tester-1`. The role definitions are documented in [[SPEC-automation-agent-roles]]. If one copy changes, update the mirrored copy in the same diff so humans and tooling keep the same contract.

For the live recurring automations with those same ids, matching names are not sufficient. Each live prompt under `$CODEX_HOME/automations/<role>/automation.toml` must explicitly read the matching repo role file (`agents/<role>.md` or `.agents/agents/<role>.md`) and treat it as part of the runtime contract. For `Analyst-1` and `Tester-1`, the runtime contract also includes `docs/project-focus.md` when that file exists.

---

## Prompt Pattern

Use prompts that are explicit about:

- the automation's single responsibility
- the repo files it may inspect or update
- the required decision criteria
- the exact artifact it must leave behind

### Canonical Prompt: feature-add automation

```text
Run an automation that reviews the current state of the project and identifies the single highest-value missing feature package or improvement that is not already captured in TODOS.md.

Requirements:
- Read the automation memory file at $CODEX_HOME/automations/<automation_id>/memory.md first if it exists
- Read the matching repo-local role contract immediately after memory: `agents/analyst-1.md` (or `.agents/agents/analyst-1.md` if your tooling expects the mirror). Treat that file's mission, inputs, outputs, guardrails, and success criteria as part of this automation's runtime contract.
- Read the knowledge base first, starting at docs/knowledge-base/000-INDEX.md
- Read TODOS.md before making a decision
- Read `docs/project-focus.md` if it exists
- Treat `docs/project-focus.md` as a human-owned steering document and do not edit it unless a human explicitly asks
- If `docs/project-focus.md` has `Status` `active` and at least one item under `Current Focus Areas`, inspect the current code, docs, and TODO coverage so you can prioritize the single highest-value missing feature package that materially advances that active focus
- If the focus document is missing, inactive, empty, or the active focus already appears sufficiently covered, fall back to the normal repo-wide gap analysis behavior
- Inspect the relevant code and docs so the recommendation is grounded in the current repo state
- Do not duplicate an existing task or deferred item
- Add exactly one new feature package entry to TODOS.md in the repo's existing detailed format so another agent can start implementation directly from the task text
- The entry must include: status, owner, dates, affected areas, summary, user-testable or operator-testable outcome, next step, blockers, implementation outline, tests, and evaluation criteria
- Do not emit isolated chores that cannot reasonably lead to a feature someone can test after a worker run
- Prefer the highest-leverage gap that materially improves product reliability, security, or user value
- If the run produces durable repo or product insight, create or update a note under docs/knowledge-base/learnings/ and link any affected KB notes or specs
- Append a journal entry to docs/journal/YYYY-MM-DD.md describing what was inspected, what was added, and why
- If the automation changes repo automation expectations or prompt contracts, update docs/knowledge-base/012-automation-architecture.md, docs/knowledge-base/013-agent-learning-system.md, and the repo instruction files
- Update the automation memory file with the decision and rationale before finishing
- Return a short inbox item summarizing what was added
```

Use this as the default prompt when creating or regenerating the repo's feature-add/backlog-curation automation. It is intentionally repo-specific: it forces the automation to load the repo role contract, honor the optional human-owned project focus, use the KB, respect `TODOS.md`, check automation memory first, and leave behind a feature package that is actionable for the next agent.

### Canonical Prompt: implementation-worker automation

```text
Run an automation that completes exactly one unblocked, high-priority feature package from TODOS.md end-to-end with accurate verification.

Requirements:
- Read the automation memory file at $CODEX_HOME/automations/<automation_id>/memory.md first if it exists
- Read the matching repo-local role contract immediately after memory: `agents/worker-1.md` (or `.agents/agents/worker-1.md` if your tooling expects the mirror). Treat that file's mission, inputs, outputs, guardrails, and success criteria as part of this automation's runtime contract.
- Read the knowledge base first, starting at docs/knowledge-base/000-INDEX.md, then inspect the notes and specs relevant to the feature package you choose
- Read TODOS.md before choosing work and do not duplicate active work, blocked work, or tasks that depend on unfinished prerequisites
- Choose exactly one unblocked feature package that materially advances the repo
- You may span multiple files or services inside that feature boundary, but do not broaden scope into unrelated cleanup or redesign
- If the chosen feature package needs a KB spec, create or update that spec as part of the same run and continue the feature work; do not stop after the spec step unless a real blocker prevents safe completion
- Finish the run with a user-testable or operator-testable feature outcome whenever possible
- Update TODOS.md with the selected feature's status, summary, next step, blockers, affected areas, and what remains if blocked
- If the run produces durable insight, create or update a note under docs/knowledge-base/learnings/ and link any affected KB notes or specs
- Append a journal entry to docs/journal/YYYY-MM-DD.md describing what changed, what was verified, and what remains
- Update KB notes or specs when repo behavior or agent expectations changed
- If the automation changes repo automation expectations or prompt contracts, update docs/knowledge-base/012-automation-architecture.md, docs/knowledge-base/013-agent-learning-system.md, and the repo instruction files
- Run the narrowest relevant verification command that proves the whole feature outcome and report the result accurately
- Update the automation memory file with the selected feature package, what changed, what was verified, blockers, and next-run guidance
- Return a short inbox item summarizing what changed or what blocked progress
```

Use this as the default prompt when creating or regenerating the repo's implementation-worker automation. It keeps the worker focused on one existing feature package, one feature-complete outcome, and one repo-local role contract.

### Canonical Prompt: test-coverage automation

```text
Run an automation that improves the repo's test coverage by making exactly one bounded, validated testing improvement per run.

Requirements:
- Read the automation memory file at $CODEX_HOME/automations/<automation_id>/memory.md first if it exists
- Read the matching repo-local role contract immediately after memory: `agents/tester-1.md` (or `.agents/agents/tester-1.md` if your tooling expects the mirror). Treat that file's mission, inputs, outputs, guardrails, and success criteria as part of this automation's runtime contract.
- Read the knowledge base first, starting at docs/knowledge-base/000-INDEX.md, then inspect the notes most relevant to the target area you choose
- Read TODOS.md before making a decision and avoid duplicating active work or recently documented gaps
- Read `docs/project-focus.md` if it exists and treat it as human-owned steering input; do not edit it unless a human explicitly asks
- If `docs/project-focus.md` has `Status` `active` and at least one item under `Current Focus Areas`, prefer one bounded test target or one bounded manual-verification target that materially stabilizes that active feature lane before falling back to repo-wide coverage work
- Inspect the current test setup across ruh-backend, ruh-frontend, and agent-builder-ui before choosing work
- Choose exactly one target per run: a missing unit test, integration test, contract test, component test, E2E regression, or one bounded Playwright manual verification of a focus-area workflow that materially improves reliability
- Prefer the cheapest stable test layer first: unit before integration, integration before E2E
- Add or improve tests directly in the repo when the change is bounded and you can verify it with the narrowest relevant command
- Use Playwright manual verification selectively, only when browser-level evidence is the best next step for a UI or workflow-heavy focus-area scenario and you can keep the run bounded to one scenario
- Only modify production code when a minimal, low-risk seam is required to make the test possible; do not broaden the task into unrelated feature work
- If a Playwright manual verification run uncovers a regression and a safe bounded automated follow-up fits the run, prefer landing that regression test; otherwise add exactly one concrete TODO entry with the failing scenario and repro context
- If no safe bounded patch or safe manual-verification follow-up is available, add exactly one concrete TODO entry describing the missing coverage gap instead of forcing a risky change
- If the run produces durable testing or architecture insight, create or update a note under docs/knowledge-base/learnings/ and link any affected KB notes or specs
- Append a journal entry to docs/journal/YYYY-MM-DD.md describing what target was chosen, whether the run patched tests, ran Playwright manual verification, or created a TODO fallback, and what was verified
- If the automation changes repo automation expectations or prompt contracts, update docs/knowledge-base/012-automation-architecture.md, docs/knowledge-base/013-agent-learning-system.md, and the repo instruction files
- Run the narrowest relevant verification command for the tests you touched, or record the Playwright manual-verification outcome accurately when the run used browser automation
- Update the automation memory file with what target was chosen, what changed, what was verified, and what should be avoided or revisited next run
- Return a short inbox item that says whether tests were added, Playwright manual verification was performed, or a TODO fallback was created
```

Use this as the default prompt when creating or regenerating the repo's recurring test-coverage automation. It keeps each run narrow, evidence-based, role-bound, aligned with the repo's requirement that automated work be understandable to the next agent, and biased toward the active project-focus lane when one exists.

### When Reusing This Prompt

- Keep the automation scoped to one bounded testing decision per run
- Reuse the same prompt unless the repo workflow or required output changes materially
- If you change this prompt, update `CLAUDE.md` (and therefore `agents.md`, which mirrors it) plus [[013-agent-learning-system]] in the same change so interactive agents and automations stay aligned

For the test-coverage automation specifically:

- Keep the automation scoped to one validated test improvement, one bounded Playwright manual-verification scenario, or one TODO fallback per run
- Allow one bounded Playwright manual-verification scenario per run only when it is the best way to validate the active focus lane and the run still leaves behind an actionable result
- Reuse the canonical test-coverage prompt above instead of shortening it into a vague "increase coverage" request
- If the automation gains new write permissions or broader patch authority, update this note, [[013-agent-learning-system]], and `CLAUDE.md` together in the same change

---

## Related Specs

- [[SPEC-automation-agent-roles]] — defines the repo-local role contracts and mirror rule for `Analyst-1`, `Worker-1`, and `Tester-1`
- [[SPEC-analyst-project-focus]] — defines the `docs/project-focus.md` steering artifact and the analyst/tester fallback rules
- [[SPEC-feature-at-a-time-automation-contract]] — defines the feature-package unit of work and the complete-feature expectation for maintainer runs
- [[SPEC-agent-learning-and-journal]] — defines the shared journal and durable-learning contract for all agent runs
- [[SPEC-test-coverage-automation]] — specifies the execution model, guardrails, and fallback behavior for the repo's test-coverage automation

---

## When To Update This Note

Update this note when any of the following changes:

- the storage location or expected structure of automation config/memory
- the repo workflow required of automation runs
- the canonical prompt pattern used for recurring repo automations
- the expected outputs or handoff format for automation runs

---

## Related Notes

- [[001-architecture]] — explains where automations fit relative to the product runtime
- [[010-deployment]] — separates deployed services from operator-run automations
- [[013-agent-learning-system]] — defines the repo-visible journal and learning-note workflow that automations must follow
