# LEARNING: Build-stage generation must consume the approved architecture plan, not just the purpose prompt

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-builder-gated-skill-tool-flow]]

## Context

During a 2026-03-30 investigation of `/agents/create?agentId=7653519b-c9cb-4269-a70c-5a94f2158a6d`, the operator reported that skills defined during Plan were not showing up as built output during Build. The linked forge-backed draft also still returned `skills=[]` and `skill_graph=[]` from the backend.

## What We Observed

- The lifecycle Plan stage already produced a structured `architecture_plan` and stored it in the Co-Pilot store.
- The Build stage did **not** consume that artifact. `CoPilotLayout` still called the legacy `generateSkillsFromArchitect()` helper with only name, description, and discovery docs.
- The legacy build prompt asked only for a generic `ready_for_review` skill graph and did not require `skill_md` on returned skill nodes.
- That meant the approved plan could diverge from build output, and draft autosave/deploy had no durable built-skill artifact to persist unless the operator later rebuilt skills manually.

## Why It Matters

- Approving Plan should constrain Build. If Build re-infers capabilities from a narrower prompt, the reviewed architecture becomes advisory instead of authoritative.
- Missing `skill_md` keeps the builder from persisting real built custom-skill content, which weakens reopen/deploy truthfulness.
- The Google Ads proving case depends on stable, explicit skill ids and domain-specific skill definitions; detached re-inference makes that path unreliable.

## Reusable Guidance

- Treat the approved `architecture_plan` as a first-class build input, not as display-only review data.
- Build-stage prompts should require `skill_graph.nodes[].skill_md` whenever the resulting skill graph is expected to persist through autosave, reopen, or deploy.
- If a lifecycle stage has already gathered a richer artifact than the original user prompt, downstream generation should use that richer artifact instead of falling back to the initial purpose text.

## Related Notes

- [[008-agent-builder-ui]] — documents the build-stage prompt contract and autosave behavior
- [[011-key-flows]] — captures the end-to-end create-flow handoff from Plan into Build
- [[SPEC-agent-builder-gated-skill-tool-flow]] — defines the truthful skill-build and deploy-blocking behavior
- [Journal entry](../../journal/2026-03-30.md)
