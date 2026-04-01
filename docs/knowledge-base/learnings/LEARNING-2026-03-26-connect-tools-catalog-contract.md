# LEARNING: Connect Tools must promote research seeds into real connector identities

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-tool-integration-workspace]]

## Context

`TASK-2026-03-26-123` replaced the mock-first Connect Tools entry point in `/agents/create` for the active Google Ads focus lane. The repo already had a truthful research workspace and a supported connector registry, but the list itself still started from filler cards and sidebar save logic persisted the clicked tool id even when research recommended a different supported connector.

## What Was Learned

Truthful connector discovery needs two separate contracts:

- The main catalog must start from supported connectors plus saved `toolConnections[]`, then add at most one focused research seed for clearly mentioned unsupported tools instead of restoring a whole mock catalog.
- The sidebar must treat the architect recommendation as authoritative for connector identity. If research says an unsupported seed like `google-ads` should really use a supported connector such as `google`, the UI has to switch to that connector's credential form and persist the supported connector id on save.

If the sidebar keeps saving the original seed id, the operator sees a direct-connector workflow but the saved metadata still lies about what the product can actually connect.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/connect-tool-catalog.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/connect-tool-catalog.test.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx`

## Implications For Future Agents

- Do not reintroduce `MOCK_TOOLS` or any multi-card filler fallback in the live Connect Tools path.
- When adding new supported connectors, update the registry and let the catalog surface them automatically instead of adding bespoke fake cards.
- When adding new unsupported-domain seeds, keep them explicitly research-first and ensure the sidebar can promote them into a real supported connector id when the architect recommendation maps that way.

## Links
- [[008-agent-builder-ui]]
- [[SPEC-tool-integration-workspace]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
