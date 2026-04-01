# Repo Automation Agents Design

## Goal

Define a clear repo-local home for recurring maintainer agents so `Analyst-1`, `Worker-1`, and `Tester-1` have explicit role contracts that humans can read and agent tooling can consume.

## Context

- The repo already documents recurring Codex automations in [[012-automation-architecture]].
- There is a repo-local `.agents/skills/kb/` tree, but no parallel catalog for named maintainer agents.
- The user asked for both a visible `agents/` folder and a hidden `.agents/` representation.

## Recommended Approach

Use a mirrored two-folder structure:

1. `agents/` as the human-readable catalog and source of truth for role definitions
2. `.agents/agents/` as the tool-facing mirror for local agent tooling conventions
3. A KB spec that defines the contract, sync rule, and the three initial agent roles

## Why This Approach

- It keeps repo conventions discoverable for humans without hiding everything in dotfolders
- It preserves compatibility with agent tooling that expects `.agents/...`
- It gives the three recurring maintainer roles stable, named responsibilities instead of implicit prompt fragments

## Initial Roles

- `Analyst-1` — identifies the single highest-value missing backlog item and records it in `TODOS.md`
- `Worker-1` — executes one unblocked, high-priority repo task with normal KB, test, and handoff discipline
- `Tester-1` — adds one bounded, validated test improvement or falls back to one concrete TODO

## Guardrails

- The visible and hidden agent definitions must stay aligned
- Role definitions should describe responsibilities and guardrails, not product runtime behavior
- KB notes must be updated because this changes agent expectations for repo maintenance
