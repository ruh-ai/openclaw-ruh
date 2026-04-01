# LEARNING: Builder hint normalization must match the truthful connector and trigger catalogs

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-tool-integration-workspace]] | [[SPEC-agent-webhook-trigger-runtime]]

## Context

Worker follow-through on `TASK-2026-03-26-127` closed the remaining gap between the truthful Configure catalogs and the upstream architect metadata that seeds AG-UI state.

## What Was Learned

- The parser that turns architect responses into builder hints is a product contract, not a private implementation detail. If it emits stale ids, Review, autosave, and Improve Agent all inherit the lie even when Configure cards are truthful.
- Google Ads intent should normalize onto the real supported connector id `google` until the product grows a direct Google Ads connector. Unsupported/manual-plan ids remain valid only when the UI already knows how to represent them honestly.
- Trigger hints must fail closed the same way as the trigger catalog: `cron-schedule` is the only deployable default today, while inbound-event ideas should use `webhook-post` as a clearly unsupported/manual-plan hint instead of defaulting to `chat-command`.
- Autosaved improvement derivation should key off the normalized connector id, so saved recommendations stay aligned with the connector registry and do not point operators at fake targets.

## Evidence

- `agent-builder-ui/lib/openclaw/builder-hint-normalization.ts`
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts`
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-metadata-autosave.test.ts`

## Implications For Future Agents

- Keep connector and trigger hint normalization in one shared helper so AG-UI payloads, autosave, and Configure stay on the same contract.
- Do not add new builder hint ids unless either the supported connector registry or an explicit manual-plan representation already exists for that id in the product.
- When webhook runtime support lands, flip the shared normalization/catalog contract together instead of adding a second trigger-specific mapping path.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-tool-integration-workspace]]
- [[SPEC-agent-webhook-trigger-runtime]]
- [[LEARNING-2026-03-26-builder-hint-truthfulness-gap]]
- [Journal entry](../../journal/2026-03-26.md)
