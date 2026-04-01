# LEARNING: Builder metadata still seeds fake connector and trigger ids upstream of Configure

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-tool-integration-workspace]] | [[SPEC-agent-webhook-trigger-runtime]]

## Context

This analyst run re-checked the active Google Ads creation-focus lane after the repo had already added a truthful Connect Tools catalog package and a separate truthful trigger-selection package to `TODOS.md`. The remaining question was whether the architect-to-builder metadata contract had become truthful too, or whether the AG-UI layer was still seeding older fake ids before the operator ever reached those updated screens.

## What Was Learned

The upstream builder-hint contract is still stale even though the visible Configure surface is moving toward truthful catalogs.

- `wizard-directive-parser.ts` still maps Google Ads intent to the unsupported direct connector id `google-ads` instead of a supported connector mapping or an explicit manual-plan seed.
- The same parser still appends `chat-command` to trigger hints by default, even though the current runtime only materializes schedule triggers and webhook delivery remains follow-on work.
- `builder-agent.ts` emits those ids into the canonical AG-UI `skill_graph_ready` payload and wizard custom events, so the mismatch is not limited to one UI component.
- `builder-metadata-autosave.ts` then derives the persisted `connect-google-ads` recommendation from that fake hint, which means saved builder improvements can still point at an unsupported connector identity after the visible Connect Tools catalog became more truthful.

## Evidence

- `agent-builder-ui/lib/openclaw/wizard-directive-parser.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts`
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-metadata-autosave.test.ts`

## Implications For Future Agents

- Treat visible Configure truthfulness and upstream builder-hint truthfulness as separate milestones. Shipping only the UI catalog fixes still leaves AG-UI metadata, autosave, and recommendations anchored to fake ids.
- Do not reintroduce `google-ads` as a canonical direct connector id or `chat-command` as a default supported runtime path inside AG-UI metadata unless the real connector registry or runtime contract grows to support them.
- Prefer one shared normalization helper from architect response to builder hints so Connect Tools, trigger selection, improvements, and AG-UI state all agree on the same connector and trigger identities.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-tool-integration-workspace]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [[LEARNING-2026-03-26-connect-tools-catalog-contract]]
- [[LEARNING-2026-03-26-trigger-selection-truthfulness-gap]]
- [Journal entry](../../journal/2026-03-26.md)
