# LEARNING: Persisted custom-built skills must survive reopen as resolved capabilities

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-gated-skill-tool-flow]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads proving-case lane was re-checked after the skill-registry, build-custom-skill, and deploy contracts had already landed. The remaining question was whether an operator-built custom skill stays truthfully resolved after the agent is saved and reopened.

## What We Observed

- `agent-builder-ui/lib/openclaw/copilot-state.ts` already stamps `skill_md` onto a skill node when the operator builds a custom skill via `markSkillBuilt()`.
- `agent-builder-ui/lib/openclaw/agent-config.ts` already forwards `skill_md` to `POST /api/sandboxes/:sandbox_id/configure-agent`, and `ruh-backend/src/app.ts` already prefers request `skill_md` over a registry match or stub fallback when writing sandbox skills.
- `agent-builder-ui/lib/skills/skill-registry.ts` only marks a skill as resolved when it is native, registry-matched, or present in the in-memory `builtSkillIds` list. Persisted `skillGraph[].skill_md` is currently ignored.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts:createCoPilotSeedFromAgent()` restores the saved `skillGraph`, but it does not rebuild `builtSkillIds` from nodes that already carry `skill_md`.
- The backend seeded registry still has no Google Ads entries, so the proving-case skills are especially likely to depend on the agent-local custom-skill path rather than a later registry rescue.

## Why It Matters

- The Google Ads proving case can look functionally complete in one session, then regress to `Needs Build` after reopen even though the saved agent already contains usable custom skill markdown.
- That mismatch creates false deploy blockers and weakens operator trust in the builder's saved state.
- The runtime contract is already more truthful than the reopen UI: deploy can still write the saved custom skill, while the reopened skills step can incorrectly claim the same skill is unresolved.

## Reusable Guidance

- Treat persisted `skillGraph[].skill_md` as durable evidence of a `custom_built` skill, not as transient session-only state.
- Reopen seed logic should restore derived custom-skill status from saved agent data rather than depending only on ephemeral `builtSkillIds`.
- For domains without seeded registry entries yet, the agent-local custom-skill path is part of the core product contract, not just an escape hatch.

## Related Notes

- [[008-agent-builder-ui]] — documents the skills step, custom-skill path, and saved-agent reopen behavior
- [[SPEC-agent-builder-gated-skill-tool-flow]] — defines `custom_built` and the deploy-blocking rules for unresolved skills
- [[SPEC-google-ads-agent-creation-loop]] — the proving-case agent currently depends on truthful reopen behavior for custom-built skills
- [Journal entry](../../journal/2026-03-27.md)
