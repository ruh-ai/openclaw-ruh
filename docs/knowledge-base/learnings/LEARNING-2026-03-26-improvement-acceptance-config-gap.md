# LEARNING: Accepted builder improvements need one shared config projector

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-agent-improvement-persistence]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run re-checked the active Google Ads creation-focus lane after the repo had already shipped persisted `improvements[]`, truthful connector and trigger catalog work, Improve Agent Co-Pilot reopen, and the create-to-deploy handoff. The goal was to identify the single highest-value missing feature package that was still not represented in `TODOS.md`.

## What Was Learned

Accepted builder improvements need one shared projection helper or the product drifts immediately.

- The shipped fix works because review acceptance, Co-Pilot acceptance, create-session seeding, Improve Agent reopen, and AG-UI draft autosave now all reuse the same projector in `create-session-config.ts`.
- For the first Google Ads slice, acceptance of `connect-google-workspace` must project the truthful `google` connector into `toolConnections[]` as `missing_secret` until credentials are stored.
- Projection must be idempotent and must not downgrade stronger saved state; an already `configured` connector should survive repeated recommendation replays or reopen flows unchanged.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/create-session-config.ts` now owns `applyAcceptedImprovementsToConfig()`, which projects accepted tool improvements into the saved/session connector contract.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` uses that helper when preparing review state, Configure handoff, and final save/deploy payloads so accepted improvements mutate real config instead of only `improvements[].status`.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` now projects the connector immediately when the operator accepts the improvement in Co-Pilot review.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` now applies the same projector before draft autosave payloads are written, so refresh/reopen can recover the accepted connector plan without waiting for a full save.

## Implications For Future Agents

- Treat improvement acceptance as a config-projection contract, not merely a metadata-persistence contract.
- Extend future recommendation categories by composing onto the shared projector instead of adding one-off acceptance logic in individual UI surfaces.
- Reuse truthful connector or trigger catalogs inside the projector so acceptance cannot recreate fake ids, duplicate entries, or downgrade stronger saved state.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-improvement-persistence]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
