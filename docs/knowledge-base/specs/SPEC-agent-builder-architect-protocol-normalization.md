# SPEC: Agent Builder Architect Protocol Normalization

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[005-data-models]]

## Status

draft

## Summary

The agent builder bridge must normalize newer architect response variants into one stable frontend contract. This keeps `/agents/create` working when the architect emits richer clarification question types, standalone data-schema approval steps, or newer `ready_for_review` JSON shapes that differ from the builder UI's older expectations.

## Related Notes

- [[001-architecture]] — the bridge is the contract boundary between the architect gateway and the builder UI
- [[005-data-models]] — documents the stable `ArchitectResponse` and related builder-side types
- [[008-agent-builder-ui]] — owns the create flow, bridge route, and chat-state processing
- [[011-key-flows]] — the create-agent flow depends on the normalized architect protocol to reach review and deployment

## Specification

### Supported architect clarification question types

The builder UI currently renders `text`, `select`, `multiselect`, and `boolean`. The bridge must normalize newer architect question types into those supported forms:

- `confirm` → `boolean`
- `info` → `text` with human-readable explanatory content and no required answer
- Unknown or missing types should degrade to `text`

### Standalone data schema proposal handling

If the architect emits a top-level `data_schema_proposal` response, the bridge must not pass raw JSON through to the chat transcript. It must convert that payload into a builder-friendly structured response that:

- shows the proposal context as normal chat text
- makes the approval/revision choice explicit to the user
- allows the chat flow to continue with a meaningful natural-language approval message

### New `ready_for_review` JSON shape

The bridge must accept both of these `ready_for_review` variants:

1. Legacy builder shape:
   - `skill_graph: { nodes, workflow }`
2. New architect shape:
   - `skill_graph: SkillDefinition[]`
   - top-level `workflow`
   - optional `approved_data_schema`, `native_tools`, `agent_metadata`, and `approval_request`

For the new shape, the bridge must normalize into the legacy builder-friendly shape:

- `skill_graph.nodes` becomes a `SkillGraphNode[]`
- `skill_graph.workflow` becomes a `WorkflowDefinition`
- `system_name` is always present
- skill descriptions should prefer the architect's `purpose`, then `description`, then `name`
- `depends_on` should be derived from the declared workflow when possible, otherwise fall back to sequential ordering

### Error handling

Unknown architect payloads should still degrade gracefully, but structured payloads that can be normalized should not fall back to raw JSON dumps or throw inside the client-side state store.

## Implementation Notes

- Extract normalization into a small helper module under `agent-builder-ui/lib/openclaw/` so it can be unit-tested without the full route handler.
- Keep `useOpenClawChat` consuming one stable `ArchitectResponse` shape; do not spread protocol-version branches throughout the UI.
- Update the builder chat UI only where needed for the normalized schema-proposal approval path.

## Test Plan

- Unit tests for clarification-type normalization (`confirm`, `info`, unknown type fallback)
- Unit tests for standalone `data_schema_proposal` normalization
- Unit tests for new-shape `ready_for_review` normalization into `skill_graph.nodes + workflow`
- Manual browser verification of `/agents/create` from prompt → clarification → schema approval → review
- Manual end-to-end verification through deployment and deployed-agent chat

## Related Learnings

- [[LEARNING-2026-03-25-architect-workflow-normalization]] — explicit architect `wait_for` edges must remain authoritative during `ready_for_review` normalization
