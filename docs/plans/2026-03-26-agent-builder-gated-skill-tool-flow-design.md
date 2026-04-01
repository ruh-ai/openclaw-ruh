# Agent Builder Gated Skill And Tool Flow Design

## Summary

The builder should not pretend the later phases are actionable before the operator has supplied the minimum context needed to infer capabilities. The first gate is `name + description`. Once both are present, the system should automatically infer required skills, resolve those skills against a real registry, and make the operator deal explicitly with any missing skill implementation before deployment. Tools should follow the same principle: research first, then recommend the most practical integration method, preferring CLI where it is the strongest fit, then MCP, then direct API.

## Product Decisions

### 1. Purpose is the first hard gate

Only the `Config` workspace tab is interactive when a new agent opens. Inside `Config`, only the `purpose` phase is active until both `name` and `description` are non-empty.

Effects:
- `terminal`, `code`, `files`, and `browser` stay visibly locked
- `skills`, `tools`, `triggers`, and `review` phases stay locked
- the lock should explain why: "Add a name and description to generate the agent setup"

This keeps the UI progressive instead of letting the user walk into empty or misleading states.

### 2. Skill generation should be automatic

Once the operator has provided both `name` and `description`, the builder should debounce and automatically request the architect-generated skill graph. Users should not have to click a separate `Generate Skills` button.

Behavior:
- first successful generation advances the internal readiness state from `purpose_locked` to `skills_ready`
- subsequent description edits may trigger regeneration, but only after debounce and only if the input materially changed
- loading and failure states belong to the `skills` phase, not to a separate dead-end screen

This is the most natural UX because the system already has enough information to act.

### 3. Skills must be registry-aware

Generated skills need an explicit availability model instead of relying only on the architect graph.

Each required skill should resolve to one of:
- `native` — implemented by a native tool/runtime capability
- `registry_match` — matched to a real registry entry
- `needs_build` — no registry or native match exists yet
- `custom_built` — operator accepted/generated a custom SKILL.md draft for this agent

The `Skills` step should show this status directly. Registry-backed skills are deployable. Missing skills are not.

### 4. Missing skills should recommend build-first, not hard-stop the whole flow

If a selected required skill has no registry match, the UI should strongly recommend `Build Custom Skill` from the `Skills` step, but it should not lock the rest of the configure flow entirely.

The actual hard block is on deploy/review completion:
- if any selected required skill remains `needs_build`, `Review` can render but `Deploy Agent` stays disabled
- the disable reason should be explicit and list the missing skill names

This keeps exploration possible while still being truthful at the moment of commitment.

### 5. “Build Custom Skill” should be inline in the first slice

There is no existing standalone skill-builder surface in this repo. The first slice should therefore use an inline custom-skill draft flow in the `Skills` step:
- start from the architect-generated skill node
- generate a SKILL.md draft
- allow the operator to accept or lightly edit it
- mark that skill as `custom_built` for this agent draft

This gives the operator a real build-first path without waiting for a separate product area.

### 6. Tool research should prefer CLI, then MCP, then API

The tool-research contract should change from “prefer MCP when possible” to:
- prefer `cli` when the tool has a stable official or widely accepted CLI and the agent’s task fits command execution well
- prefer `mcp` when there is a credible maintained MCP server and it improves agent tool-call workflows
- prefer `api` when CLI/MCP are poor fits or unavailable

This is a default preference order, not a blind rule. The architect still needs to choose the actual best fit for the tool and use case.

## UX Flow

1. Operator opens `/agents/create`
2. All workspace tabs except `Config` are locked
3. `Config` opens on `purpose`
4. Operator enters `name` and `description`
5. Builder auto-generates skills
6. Each skill resolves against the skill registry and is marked `native`, `registry_match`, or `needs_build`
7. Operator can:
   - keep registry/native skills
   - deselect unnecessary skills
   - click `Build Custom Skill` for unresolved required skills
8. Once at least one valid skill set exists, `Tools` and `Triggers` become actionable
9. `Tools` research recommends `cli`, `mcp`, or `api` with the new priority order
10. `Review` remains visible, but `Deploy Agent` is disabled until all selected required skills are deployable and all required credential-backed tools are either configured or intentionally unsupported/manual

## Data Model Additions

The current frontend builder state needs a new skill-availability layer. A practical first-slice shape is:

```ts
type SkillAvailability =
  | { kind: "native"; reason: string }
  | { kind: "registry_match"; registrySkillId: string; title: string; tags: string[] }
  | { kind: "needs_build"; reason: string }
  | { kind: "custom_built"; draftId: string; title: string };
```

And per-skill custom drafts:

```ts
interface CustomSkillDraft {
  skillId: string;
  title: string;
  description: string;
  skillMd: string;
  source: "architect_draft";
}
```

These should live in builder/co-pilot state and only become persisted agent config once save/deploy happens.

## Backend Scope

The backend should expose the first real skill registry API from the already-tracked registry task:
- `GET /api/skills`
- `GET /api/skills/:skill_id`

The registry itself can stay file-backed/static in the first slice. The important contract is that the frontend can distinguish registry-backed from missing skills without guessing.

## Non-Goals

- full standalone skill marketplace UI
- versioned skill publishing workflow
- collaborative code editor for custom skills
- automatic installation of arbitrary third-party CLIs or MCP servers during builder research

## Risks And Mitigations

### Risk: auto-generation is noisy

Mitigation: debounce generation and require both fields to be non-empty. Regenerate only when the purpose changed meaningfully.

### Risk: registry matching is fuzzy and wrong

Mitigation: show the matched entry explicitly and let the operator choose a different registry entry or build a custom skill.

### Risk: deploy gating feels arbitrary

Mitigation: show a specific blocking reason in review: missing custom skill builds and missing required tool credentials are listed by name.

## Validation

Success means:
- users cannot wander through empty builder tabs before purpose exists
- skills appear automatically after purpose input
- every selected skill is clearly shown as registry-backed, native, or needing a custom build
- users have an explicit build-first path for missing skills
- deploy is blocked only on unresolved required work, not on mere exploration
- tool research recommendations prefer CLI first, then MCP, then API unless the tool clearly warrants otherwise
