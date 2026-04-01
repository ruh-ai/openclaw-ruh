# SPEC: Agent Builder Gated Skill And Tool Flow

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-tool-integration-workspace]]

## Status

implemented

## Summary

`/agents/create` should not let operators walk through meaningless builder tabs before the agent has enough purpose metadata to infer real capabilities. This feature locks the builder on `name + description`, auto-generates required skills after that gate is satisfied, resolves those skills against a real registry, gives missing skills an explicit `Build Custom Skill` path, fails closed when required runtime inputs are still blank at deploy time, and updates tool research so the architect prefers `cli` first, then `mcp`, then `api` when recommending integrations.

## Related Notes

- [[008-agent-builder-ui]] — owns the Co-Pilot workspace, skills/tools/triggers phases, and deploy gating behavior
- [[011-key-flows]] — documents the end-to-end gated create-agent journey
- [[002-backend-overview]] — owns the new read-only builder skill-registry module surface
- [[004-api-reference]] — will expose the first read-only skill-registry API and updated builder-facing contracts
- [[005-data-models]] — documents the skill-registry and custom-skill draft shapes the builder uses
- [[SPEC-tool-integration-workspace]] — extends the tool-research contract with the new `cli > mcp > api` preference order
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case now depends on truthful skill availability and deploy blocking for unresolved custom skills

## Specification

### Purpose Gate

For a new agent in `/agents/create`:
- only the `Config` workspace tab is interactive initially
- within `Config`, only the `purpose` phase is interactive
- the builder remains locked until both `name` and `description` are non-empty

Locked tabs and phases must show a reason such as:
- `Add a name and description to generate the agent setup`

This lock applies to:
- Co-Pilot phase stepper navigation
- the builder-side `terminal`, `code`, `files`, and `browser` tabs
- review/deploy actions

### Automatic Skill Generation

Once both `name` and `description` are present, the builder should automatically generate the required skill graph through the architect.

Rules:
- generation should debounce rather than fire on every keystroke
- the operator should not need a separate `Generate Skills` click in the main Co-Pilot path
- generation failures should surface in the `skills` phase without silently unlocking later steps
- a successful skill graph should unlock `skills` and downstream steps

### Skill Availability Model

Each generated required skill must resolve to one of:
- `native` — implemented by a native tool/runtime capability
- `registry_match` — matched to a real skill-registry entry
- `needs_build` — no registry or native implementation exists yet
- `custom_built` — operator created/accepted a custom SKILL.md draft for this agent

The builder UI must show this availability state directly in the `Skills` step.

### Skill Registry Contract

The backend must expose a read-only skill registry for the builder:
- `GET /api/skills`
- `GET /api/skills/:skill_id`

The first slice may use a static/file-backed registry with seeded entries.

Registry matching rules:
- exact `skill_id` matches should work
- underscore/hyphen normalization should work
- unmatched skills should resolve to `needs_build`

### Build Custom Skill Path

When a selected required skill resolves to `needs_build`, the `Skills` step must offer `Build Custom Skill`.

The first slice should:
- generate a SKILL.md draft from the architect-produced skill node
- allow the operator to accept that draft for the current agent
- mark the skill as `custom_built`

This is an agent-local draft path, not a global skill marketplace or publishing workflow.

### Review And Deploy Blocking

Operators may still inspect `Tools`, `Triggers`, and `Review` while some skills remain unresolved, but deployment must fail closed.

Rules:
- if any selected required skill is still `needs_build`, `Deploy Agent` must be disabled
- the disable reason must explicitly list the unresolved skills
- if any required `runtimeInputs[]` entry is blank, both `Deploy Agent` and Ship-stage `Save & Activate` must be disabled
- the disable reason must explicitly list the missing required runtime-input keys
- if Ship activation still reaches `pushAgentConfig()`, the UI must treat `ok: false` as a failed activation instead of falling through to a success state
- if a required credential-backed tool is missing saved credentials, deploy should continue to use the existing `missing_secret` fail-closed path from [[SPEC-tool-integration-workspace]]

### Tool Recommendation Order

The shared tool-research contract should change its default priority order to:
1. `cli`
2. `mcp`
3. `api`

Rules:
- `cli` should be preferred when the tool has a stable official or de facto CLI and the use case fits command execution
- `mcp` should be preferred when a credible maintained MCP server exists and is a better fit than CLI
- `api` should be recommended when CLI and MCP are weak fits or unavailable
- the architect must still choose the actual best fit per tool and use case; this is a preference order, not a blind override

## Implementation Notes

- Extend the existing `TASK-2026-03-25-05` real skill registry direction instead of creating a second skill-availability system.
- Keep the first skill-registry slice read-only and static/file-backed.
- The lifecycle Build stage must consume the approved architecture-plan artifact when it asks the architect to generate the final `ready_for_review` payload; it should not silently re-infer a different skill set from name/description alone.
- Build-stage generation must require `skill_graph.nodes[].skill_md` in the returned payload so draft autosave, reopen, and deploy all share the same durable custom-skill artifact.
- When a selected skill has a registry match, sandbox config apply should write that seeded `skill_md` content instead of a generic placeholder skill stub.
- Reuse the existing `buildSkillMarkdown()` path for the first custom-skill draft flow instead of introducing a full standalone skill-builder product.
- Keep custom skill drafts in builder/co-pilot state until save/deploy decides what becomes persisted.
- Update the tool-research prompt in the existing architect bridge contract rather than introducing a new backend tool-research endpoint.
- Keep frontend deploy readiness aligned with backend `POST /api/sandboxes/:sandbox_id/configure-agent` required-runtime-input enforcement; runtime inputs cannot be advisory in the UI if config apply rejects them.

## Test Plan

- Backend unit tests for skill registry matching and normalization
- Backend route tests for `GET /api/skills` and `GET /api/skills/:skill_id`
- Frontend unit tests for skill availability resolution (`native`, `registry_match`, `needs_build`)
- Frontend tests for Co-Pilot purpose locking and tab/phase unlock behavior
- Frontend tests for registry-aware `StepChooseSkills` rendering and `Build Custom Skill`
- Frontend tests for review/deploy blocking while unresolved skills remain
- Frontend tests for runtime-input deploy blocking on both the page-level CTA and the embedded Ship-stage CTA
- Frontend tests for the updated `cli > mcp > api` tool-research prompt and route handling

Manual/operator verification:
- open `/agents/create`
- confirm only `Config` is interactive before `name + description`
- enter both fields and confirm skills generate automatically
- confirm each skill shows as registry-backed, native, or build-required
- build one missing custom skill and confirm deploy unblocks only after all selected required skills are resolved
- leave one required runtime input blank and confirm both deploy CTAs stay disabled until the operator fills it
- research a tool and confirm the recommendation now prefers CLI before MCP before API when appropriate

## Related Learnings

- [[LEARNING-2026-03-26-google-ads-deploy-readiness-gap]] — the current implementation still does not enforce the documented `missing_secret` fail-closed deploy path for selected credential-backed tools
- [[LEARNING-2026-03-30-copilot-ship-runtime-input-readiness-gap]] — Ship-stage activation drifted from backend runtime-input enforcement until the frontend started honoring the same fail-closed contract
