# LEARNING: Builder forge-stage truthfulness on reopen

[[013-agent-learning-system|← Learning System]] | [[008-agent-builder-ui]] | [[SPEC-agent-create-session-resume]]

## Context

While debugging `/agents/create?agentId=845b21b6-15cf-43dc-a194-3fd134d41428`, the backend row showed `status=forging`, `forge_stage=review`, and an empty persisted `skill_graph` plus empty `creation_session.coPilot`.

## What happened

- `/agents/create` patched `forge_stage` immediately whenever `devStage` changed.
- The richer `creationSession` payload and saved builder metadata were still persisted on a debounce.
- A refresh or reopen between those two writes let the backend advertise `review` even though no persisted build artifacts existed yet.
- Resume logic then trusted that advanced stage hint and reopened the stepper with Think/Plan/Build painted complete.

## Durable rule

- Treat `forge_stage` as a hint, not proof, for `review` and later lifecycle stages.
- Only trust or persist `review`, `test`, `ship`, or `reflect` when persisted build artifacts exist, typically a non-empty `skillGraph` or a saved co-pilot session that proves those artifacts landed.
- If lifecycle markers and persisted artifacts disagree, fail closed to the artifact-backed state.
- Even when build artifacts do exist, do not derive green completion badges from resumed stage position alone. Completion UI should follow explicit saved lifecycle statuses; otherwise older active agents reopen on Review with Think/Plan/Build falsely marked complete.
- Existing-agent improve sessions need an even stricter rule: baseline workspace skills are not evidence that the current improvement build already finished. Reconciliation logic must distinguish brand-new interrupted builds from reopened prebuilt agents.
- `skill_graph_ready` is not itself proof that the Build phase should complete. Only convert it into `buildStatus = done` when the lifecycle is already in `build`; otherwise plan-time or hydration-time graph payloads can skip the real build trigger.

## Reuse

- When adding restore or reconciliation logic in [[008-agent-builder-ui]], prefer durable artifacts over optimistic stage flags.
- When changing builder persistence or forge lifecycle wiring, keep [[SPEC-agent-create-session-resume]] aligned with the fail-closed rule so reopen state never outruns saved work.
