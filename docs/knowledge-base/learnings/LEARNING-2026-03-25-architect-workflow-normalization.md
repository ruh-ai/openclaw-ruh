# LEARNING: Architect Workflow Dependencies Must Survive Normalization

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The agent builder uses `agent-builder-ui/lib/openclaw/response-normalization.ts` to translate newer architect payloads into the legacy builder-friendly `ArchitectResponse` contract described in [[SPEC-agent-builder-architect-protocol-normalization]] and [[008-agent-builder-ui]].

## What Was Learned

The `ready_for_review` normalization path was preserving the incoming skill list but discarding explicit workflow `wait_for` edges whenever the architect supplied them. The helper rebuilt both `skill_graph.nodes[].depends_on` and `skill_graph.workflow.steps[].wait_for` as a simple sequential chain, which silently changed architect intent for fan-out or parallel flows.

## Evidence

- A new Bun regression in `agent-builder-ui/lib/openclaw/response-normalization.test.ts` reproduced a `ready_for_review` payload where both `summarize` and `publish` depended on `collect`.
- The initial red run showed `publish.depends_on` being normalized to `["summarize"]` instead of the supplied `["collect"]`.
- Updating the helper to read `parsed.workflow.steps[*].wait_for` fixed the regression and kept the existing single-file Bun verification green.

## Implications For Future Agents

- When the architect protocol evolves, treat `workflow.steps[].wait_for` as canonical dependency input when it is present.
- Do not assume the builder can safely recover dependencies from skill ordering alone; sequential fallback is only a fallback.
- Keep normalization tests close to the helper so protocol-shape drift is caught before `/agents/create` regresses in the browser.

## Links
- [[008-agent-builder-ui]]
- [[SPEC-agent-builder-architect-protocol-normalization]]
- [Journal entry](../../journal/2026-03-25.md)
