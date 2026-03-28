# SPEC: Agent Create-to-Deploy Handoff

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

`/agents/create` must treat `Deploy Agent` as the start of the first deployment workflow, not as a save-and-exit action. New-agent completion now saves or promotes the draft, finalizes any first-save credential commits, and hands off into `/agents/[id]/deploy` with create-source context so the deploy surface can either auto-start safely or show a truthful blocked state. The same deploy handoff also applies when an existing saved agent has zero attached sandboxes, because there is no live deployment to hot-push.

## Related Notes

- [[008-agent-builder-ui]] — owns the create flow, Co-Pilot completion handlers, and deploy page UX
- [[011-key-flows]] — documents the end-to-end builder-to-deploy journey
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case depends on this handoff being real
- [[SPEC-agent-builder-gated-skill-tool-flow]] — deploy gating still owns readiness blockers layered on top of this route handoff

## Specification

- The new-agent create flow must no longer end with `router.push("/agents")` after a deploy-labeled action.
- Completion for new agents and autosaved drafts must:
  - persist the final builder/config snapshot onto one saved agent id
  - commit any pending first-save credential drafts for credential-backed tools
  - finalize saved `toolConnections[]` metadata before the deploy page reads it
  - route to `/agents/<id>/deploy?source=create`
- The deploy handoff may include `autoStart=1` only when the saved config summary is already `Ready to deploy`.
- When the saved config is not ready, the deploy page must still open for the same agent and show a truthful saved/blocked state instead of silently falling back to the list view.
- Improve Agent remains a split completion path:
  - existing deployed agents keep save + hot-push behavior and return to `/agents`
  - existing agents with zero attached sandboxes use the same deploy handoff route as first deploy

## Implementation Notes

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` owns the save/promote + first-save credential finalize + deploy-route handoff logic.
- `agent-builder-ui/lib/agents/deploy-handoff.ts` centralizes both the create-source route contract and the existing-agent completion routing decision.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` reads the create-source query params, surfaces a handoff banner, and auto-starts only when the handoff explicitly requests it.
- Browser coverage should assert the route changes to `/agents/<id>/deploy?...` rather than `/agents`.

## Test Plan

- Bun unit test for the deploy handoff helper route/query contract
- Bun unit test for the improve-agent route split (`/agents` for deployed agents, `/agents/[id]/deploy` for undeployed ones)
- Browser regression in `agent-builder-ui/e2e/create-agent.spec.ts` asserting `Deploy Agent` lands in `/agents/<id>/deploy` and no longer returns to `/agents`
- Focused typecheck review for the changed create/deploy files
