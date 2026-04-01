# LEARNING: Google Ads deploy readiness is still not fail-closed

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-builder-gated-skill-tool-flow]]

## Context

While reviewing the active Google Ads creation-focus lane for the next missing feature package, the saved config contract, deploy surfaces, and backend config-apply route were compared against the current `TODOS.md` backlog to avoid duplicating the AG-UI cutover, builder timeout handling, and review/deploy truthfulness packages already in flight.

## What Was Learned

- The repo now persists enough structured readiness metadata to know when a Google Ads agent is not runtime-ready, but the live deploy path still does not enforce that contract.
- Builder deploy gating currently blocks only for missing purpose metadata or unresolved skills; it does not block for selected tools that remain `missing_secret` or for unsupported trigger selections.
- Backend config apply currently treats missing credential-backed MCP config as a non-fatal omission, so a deploy can return success even when the saved agent contract says a required runtime integration is not actually configured.
- This is a documented-contract mismatch, not just an unimplemented improvement: the shipped builder spec already says required credential-backed tools should remain on the `missing_secret` fail-closed path.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` computes `canDeploy` from purpose metadata, skill generation, and unresolved selected skills only.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` persists or promotes the agent in both completion handlers without checking `toolConnections[]` or `triggers[]` readiness.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` always allows `startDeploy()` from a summary card that only shows skill count plus `triggerLabel`.
- `ruh-backend/src/app.ts` loads decrypted credentials only when they exist and still returns `{ ok: true, applied: true }` even if no selected Google Ads MCP config could be written.
- `docs/knowledge-base/specs/SPEC-agent-builder-gated-skill-tool-flow.md` says required credential-backed tools should keep deploy on the `missing_secret` fail-closed path, but the implementation currently enforces only the unresolved-skill half of that rule.

## Implications For Future Agents

- Treat deploy readiness as a shared cross-layer contract, not just a deploy-page copy improvement.
- Reuse persisted `toolConnections[]` and `triggers[]` metadata to derive blocker reasons instead of adding another ad hoc readiness model.
- Enforce the same readiness rules in the frontend and backend so bypassing UI affordances cannot create a partial Google Ads runtime that looks successfully deployed.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-builder-gated-skill-tool-flow]]
- [Journal entry](../../journal/2026-03-26.md)
