[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]]

# LEARNING: Selected skills must project into the saved runtime contract

## Context

During the March 27 analyst automation pass, the active [[SPEC-analyst-project-focus]] steering still required Choose Skills to shape the persisted Google Ads agent record and deploy/runtime path, not just the visible review copy. The repo already had draft-persistence and selected-skill seeding work in flight, so this pass re-checked whether deselecting a skill actually changed what would be saved and deployed.

## Original gap

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepChooseSkills.tsx` and the Co-Pilot store both track a real selected-skill subset.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` uses that subset only to derive the shallow saved `skills[]` label list in `handleComplete()` and `handleCoPilotComplete()`.
- The same save paths still persist the full generated `skillGraph` and `workflow` unchanged, even when the operator deselects one of the generated skills.
- `agent-builder-ui/lib/openclaw/agent-config.ts` treats the saved `skillGraph` as the runtime source of truth for `buildSoulContent()` and the `skills` payload sent through config apply, so deselected skills still reach SOUL and sandbox configuration.

## Why it mattered

This means Choose Skills is still partly decorative. The UI can show a filtered selected-skill set while the saved runtime contract continues to contain and deploy the original full architect graph. In the active Google Ads proving case, an operator can deselect a skill such as a pacing-report action and still ship it because deploy/runtime reads `skillGraph`, not the shallow `skills[]` list.

## Resolution

- `agent-builder-ui/app/(platform)/agents/create/create-session-config.ts` now exports `projectSelectedSkillsRuntimeContract()`.
- The helper canonicalizes selected ids against the live graph, filters `skillGraph` to the kept subset, prunes node `depends_on` plus workflow `wait_for` edges, and removes runtime-input requirements that only belonged to deselected skills.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` now uses that helper in both `handleComplete()` and `handleCoPilotComplete()` before persisting or hot-pushing the agent, so saved agent state and deploy/runtime consumers read the same projected contract.

## Reuse

- Treat selected-skill ids as insufficient by themselves; completion must project the actual `skillGraph`, `workflow`, and runtime-input contract before save, deploy, reopen, or hot-push.
- When checking whether a config surface is truthful, trace the value through `Review` and `Deploy` all the way into `agent-config.ts` rather than stopping at the saved-agent sidebar or label summary.
- Keep this contract distinct from draft-persistence work such as [[LEARNING-2026-03-26-copilot-draft-config-persistence-gap]]: persisting the chosen ids is necessary, but it does not make runtime behavior match the operator's selection unless the graph/workflow payload is filtered too.
