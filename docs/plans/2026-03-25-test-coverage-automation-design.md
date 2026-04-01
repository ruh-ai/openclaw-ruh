# Test Coverage Automation Design

## Goal

Define a recurring Codex automation for this repo that improves test coverage by making one bounded, validated test addition per run instead of only reporting gaps.

## Context

- Repo automations are an operator layer documented in [[012-automation-architecture]].
- This repo already requires KB-first orientation and `TODOS.md` discipline for non-trivial work.
- The existing `tester-template` automation was only a placeholder sentence and did not encode safe execution rules.

## Recommended Approach

Use a bounded analyze-patch-verify loop:

1. Read automation memory, KB, and `TODOS.md`
2. Inspect current test infrastructure and identify the single safest missing coverage gap
3. Add or improve tests for exactly one area
4. Run the narrowest relevant verification command
5. Update memory with what changed and what remains risky
6. Return an inbox item with the patch result or fallback

## Why This Approach

- It makes real repo progress on each run
- It keeps diffs reviewable and runtime bounded
- It avoids turning the automation into a broad autonomous refactor
- It creates a clear fallback path when safe automated test work is not possible

## Guardrails

- One bounded coverage improvement per run
- Prefer the cheapest stable test layer first: unit, then integration, then UI/e2e
- Use repo-native test locations and frameworks instead of inventing new harnesses
- Modify production code only when a minimal test seam is required
- If verification cannot be completed safely, leave a concrete `TODOS.md` task instead of guessing

## Artifacts

- KB spec for the automation behavior
- Canonical prompt stored in [[012-automation-architecture]]
- Repo instructions updated to point future agents to the canonical prompt
- Updated `tester-template` automation config and memory
