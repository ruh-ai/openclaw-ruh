# SPEC: Agent Discovery Doc Persistence

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

The default `/agents/create` Co-Pilot flow now treats the approved PRD/TRD discovery pair as durable saved-agent state instead of transient wizard-only context. Approved discovery documents persist through draft autosave, save, reopen, and Improve Agent so operators can verify the same requirements context that generated the Google Ads agent.

## Related Notes

- [[008-agent-builder-ui]] — the Co-Pilot discovery step, review surface, and reopen seeding live here
- [[011-key-flows]] — the create/save/reopen journey now preserves the approved requirements documents
- [[005-data-models]] — the `agents` record gains a nullable `discovery_documents` JSON field
- [[004-api-reference]] — create and config patch payloads now accept `discoveryDocuments`
- [[SPEC-google-ads-agent-creation-loop]] — this closes a persistence gap in the Google Ads proving-case builder path
- [[SPEC-agent-improvement-persistence]] — Improve Agent now reopens with both saved improvements and the approved requirements context

## Specification

### Goal

Ship one bounded persistence slice that:
- stores the approved PRD/TRD pair on the saved agent record
- includes edited document section content, not just the original generated text
- restores the same documents when a saved draft or active agent reopens in Co-Pilot
- surfaces a compact requirements summary in Review so operators can confirm the reopened agent still matches the approved documents

### Saved Discovery Contract

Saved agents may now store `discoveryDocuments` / `discovery_documents` with:
- `prd.title`
- `prd.sections[]` containing `{ heading, content }`
- `trd.title`
- `trd.sections[]` containing `{ heading, content }`

Rules:
- The field stores only the approved document pair. It does not store transcript history, hidden architect chain-of-thought, or raw tool logs.
- Existing agents without saved discovery documents must continue to load cleanly.
- Config-patch validation must fail closed for malformed document shapes or unknown keys.

### Save And Autosave Contract

- Draft autosave may create the first draft agent before discovery documents are persisted, but once approved docs exist they must be written onto that same draft record without waiting for final deploy.
- Final save and Improve Agent save must persist the current approved document set together with the rest of the builder config contract.
- Reopen seeding must hydrate Co-Pilot discovery state from the saved documents and keep the phase compatible with the existing review-first Improve Agent path.

### Review Contract

- Review surfaces should show a compact, read-only summary of the saved PRD/TRD sections so the operator can verify that reopened builder state still reflects the approved requirements context.

## Implementation Notes

- Backend persistence uses a new ordered schema migration adding nullable `agents.discovery_documents JSONB`.
- `ruh-backend/src/validation.ts` accepts `discoveryDocuments` on create and config patch payloads and enforces the bounded document shape.
- `agent-builder-ui/hooks/use-agents-store.ts` extends the saved-agent contract plus draft/config persistence helpers with `discoveryDocuments`.
- `agent-builder-ui/lib/openclaw/copilot-flow.ts` includes saved discovery documents in Co-Pilot reopen seeds.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` keeps draft discovery documents synced onto the autosaved draft record and includes them in final save paths.
- `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx` renders a compact approved-requirements summary.

## Test Plan

- `ruh-backend/tests/unit/validation.test.ts`
- `ruh-backend/tests/unit/agentStore.test.ts`
- `agent-builder-ui/hooks/use-agents-store.test.ts`
- `agent-builder-ui/lib/openclaw/copilot-flow.test.ts`

Manual/operator verification:
- Open `/agents/create`
- Enter a Google Ads agent purpose and wait for discovery docs
- Edit and approve the PRD/TRD
- Wait for draft autosave, refresh or reopen the saved draft through Improve Agent, and confirm the same PRD/TRD content returns
- Confirm Review shows the approved requirements summary from saved state

## Related Learnings

- [[LEARNING-2026-03-27-discovery-doc-persistence-gap]] — approved discovery documents were transient store-only state until the saved-agent contract grew a bounded `discovery_documents` field
