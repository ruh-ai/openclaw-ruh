# SPEC: Architect Structured Config Handoff

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agent-builder-architect-protocol-normalization]]

## Status

implemented

## Summary

The builder architect already emits structured `tool_connections` and `triggers` in `ready_for_review`, but the frontend contract was discarding them and falling back to keyword hints. This slice preserves those explicit objects through normalization, AG-UI builder metadata, draft autosave, and reopen so the Google Ads proving case reflects the architect's researched runtime plan instead of a heuristic approximation.

## Related Notes

- [[008-agent-builder-ui]] — owns the architect bridge, AG-UI builder state, and `/agents/create` configure/review flow
- [[SPEC-agent-builder-architect-protocol-normalization]] — the upstream response-normalization contract now includes structured config preservation
- [[SPEC-google-ads-agent-creation-loop]] — the saved agent config contract remains the destination for these explicit connector and trigger objects
- [[011-key-flows]] — create, save, reopen, and Improve Agent should all show the same explicit config once the handoff is preserved

## Specification

### In-scope fields

The first bounded slice preserves these `ready_for_review` fields:

- `tool_connections`
- `triggers`

The architect may continue to emit other structured fields such as `cron_jobs` or `soul_content`, but those are out of scope unless they are already consumed elsewhere.

### Normalized contract

The builder-side `ArchitectResponse` must expose:

- `tool_connections` as the existing saved-agent `toolConnections[]`-compatible metadata shape
- `triggers` as the existing saved-agent `triggers[]`-compatible metadata shape

Normalization rules:

- Explicit structured config wins over heuristic inference when both are present.
- Older architect payloads without explicit `tool_connections` or `triggers` continue to fall back to the existing hint-detection path.
- Supported direct connectors should reuse the current registry metadata when the architect omits display or auth details.
- Structured schedule triggers must preserve the emitted `schedule` payload so save/reopen/deploy can keep the architect-selected cadence.

### Builder metadata and autosave

AG-UI builder metadata must store both:

- heuristic hint ids for backwards-compatible UI nudges and derived improvements
- explicit normalized `toolConnections[]` and `triggers[]` objects for draft persistence and reopen

Draft autosave should prefer explicit architect-provided objects when present, then fall back to the persisted agent record, and only finally rely on hint-derived projections.

### Operator-visible behavior

When the architect emits explicit Google Ads connector metadata and a supported schedule trigger:

- Co-Pilot review/configure should show the same connector identity and trigger details immediately
- draft autosave should persist that same structured config
- reopening the draft or Improve Agent should restore the same connector and trigger objects without recomputing them from keywords

## Implementation Notes

- `response-normalization.ts` owns the raw architect-payload to normalized-frontend-contract mapping.
- `wizard-directive-parser.ts` and `builder-agent.ts` remain responsible for event emission, but must prefer explicit objects over derived hint ids.
- `builder-metadata-autosave.ts`, `builder-state.ts`, and `use-agent-chat.ts` now treat explicit tool/trigger objects as first-class builder metadata.

## Test Plan

- Unit test `ready_for_review` normalization keeps explicit `tool_connections` and `triggers`
- Unit test wizard parsing prefers explicit structured config over inferred hint fallbacks
- AG-UI builder tests confirm `SKILL_GRAPH_READY` and wizard events carry the explicit normalized config
- Builder metadata autosave tests confirm draft persistence prefers explicit structured config when present
