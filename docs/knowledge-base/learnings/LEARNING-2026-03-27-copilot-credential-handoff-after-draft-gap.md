# LEARNING: Co-Pilot connector credentials need a post-draft encrypted handoff

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-tool-integration-workspace]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads proving-case lane was re-checked after direct `google-ads` connector support, secure saved credential routes, visible Co-Pilot draft autosave, and the runtime-input contract were already in place. The remaining question was whether the default `/agents/create` Co-Pilot path actually transitions from ephemeral credential drafts to saved encrypted credentials once autosave creates a real draft agent record.

## What We Observed

The current Co-Pilot Connect Tools path never crosses that boundary.

- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx` renders `StepConnectTools` without passing `agentId`, so the embedded tool setup flow never knows when a persisted draft agent already exists.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx` treats `!agentId` as the pre-save branch: it returns raw field values through local `credentialDrafts` and labels the summary as `Credentials saved for first agent save` instead of calling `saveToolCredentials()`.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts` reseeds reopened agents with `credentialDrafts: {}`, which is correct for safety, but it also means any Google Ads credentials that never reached the encrypted credential route are intentionally unrecoverable after refresh or reopen.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` can create a real draft agent id through the visible `Draft saved` loop, but no follow-on handoff commits pending Co-Pilot credential drafts once that id exists.

## Why It Matters

- `docs/project-focus.md` treats the default Co-Pilot `/agents/create` path as the primary Google Ads builder journey, so credential handling there must be as truthful as the advanced configure/save path.
- The current behavior weakens operator trust: the UI can show a configured Google Ads connector during the live session, then reopen the same draft as `missing_secret` because the secret never left ephemeral browser state.
- This is a distinct concern from safe draft autosave. Raw credential drafts should remain excluded from autosaved metadata, but once autosave has already produced a real agent id the product should switch to the existing encrypted credential API rather than stranding those drafts in memory.

## Reusable Guidance

- Treat `draftAgentId` creation as the boundary where connector credential handling changes from ephemeral draft state to encrypted saved state.
- Keep raw secret values out of autosaved metadata, persisted Zustand state, URLs, and reopen payloads, but do not confuse that safety rule with "never commit until final deploy." The correct handoff target is the existing `PUT /api/agents/:id/credentials/:toolId` route once an id exists.
- Pass the effective persisted agent id into every Connect Tools surface that is supposed to support truthful one-click connectors; otherwise the UI will remain stuck in the local-draft branch forever.
- Reopen logic should continue to seed `credentialDrafts: {}` and derive readiness from saved credential summary only.

## Related Notes

- [[008-agent-builder-ui]] — documents the embedded Co-Pilot builder shell and the current Connect Tools contract
- [[SPEC-tool-integration-workspace]] — defines the ephemeral-pre-save to encrypted-post-save credential handoff boundary
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case depends on truthful connector readiness across save, reopen, and deploy
- [[LEARNING-2026-03-26-copilot-draft-config-persistence-gap]] — safe draft autosave of metadata is separate from the post-draft secret handoff problem
- [[LEARNING-2026-03-27-google-ads-connector-contract-split]] — Google Ads now has a real direct connector, which raises the cost of leaving Co-Pilot credential handling in a weaker local-only mode
- [Journal entry](../../journal/2026-03-27.md)
