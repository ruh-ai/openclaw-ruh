# SPEC: Builder Contextual Refine Loop

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]] | [[SPEC-copilot-config-workspace|Co-Pilot Config Workspace]]

## Status

implemented

## Summary

The `/agents/create` builder loop should stay grounded in the current agent instead of drifting back to generic examples or stale stage state. Once the operator has named and described the agent, builder prompt suggestions become contextual, Think-stage loading must not regress after later lifecycle steps, and post-build architect runs must be re-seeded with the current tools, runtime inputs, heartbeat, plan, and SOUL summary before they refine the draft.

## Related Notes

- [[008-agent-builder-ui]] — owns the shared builder chat shell, empty-state suggestions, and architect run context
- [[011-key-flows]] — documents the operator-visible lifecycle and what each stage-specific architect run should know
- [[SPEC-copilot-config-workspace]] — the builder loop still runs inside one unified Agent's Computer workspace
- [[SPEC-agent-builder-gated-skill-tool-flow]] — contextual suggestions and refine runs must stay aligned to the current named agent and resolved config, not generic fallback ideas

## Specification

### Think Status Truthfulness

- `think_status: generating` is valid only while the lifecycle is still in `think`.
- Once the builder has advanced past `think`, later architect runs must not flip the Think stage back to a loading spinner.
- Delayed or stray Think-status events after stage advancement should be ignored fail-closed.

### Contextual Builder Suggestions

- Before the operator has provided a name and description, the builder chat may show generic example prompts.
- Once both fields are present, the empty-state builder suggestions must be derived from the current agent name, description, and lifecycle stage.
- Contextual suggestions must stay inside the current agent mission and avoid unrelated canned examples.

### Refine-Stage Architect Reconfiguration

- Architect runs in `review`, `test`, `ship`, and `reflect` should use a dedicated refine-mode instruction instead of continuing with the one-shot build instruction.
- Every architect run should receive the current builder-state snapshot, including when available:
  - current lifecycle stage and phase
  - name, description, system name
  - selected and built skills
  - tool readiness
  - runtime input completeness
  - triggers / heartbeat
  - channels
  - accepted improvements
  - architecture-plan summary
  - SOUL summary
- Refine-mode runs must update the current agent in place and must not invent a different agent concept unless the operator explicitly asks for a redesign.

## Implementation Notes

- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` now gates Think-status emission to the Think stage and applies a dedicated `REFINE_SYSTEM_INSTRUCTION` for post-build lifecycle stages.
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.ts` now formats a richer `[WIZARD_STATE]` block with runtime, channel, plan, heartbeat, and SOUL-summary context.
- `agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts` ignores regressive Think-status events after the lifecycle has advanced.
- `agent-builder-ui/lib/openclaw/builder-chat-suggestions.ts` centralizes stage-aware builder suggestion generation for the shared chat shell.

## Test Plan

- `cd agent-builder-ui && bun test 'lib/openclaw/ag-ui/__tests__/builder-agent.test.ts'`
- `cd agent-builder-ui && bun test 'lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts'`
- `cd agent-builder-ui && bun test 'lib/openclaw/wizard-directive-parser.test.ts'`
- `cd agent-builder-ui && bun test 'lib/openclaw/builder-chat-suggestions.test.ts'`
- `cd agent-builder-ui && npx tsc --noEmit`
