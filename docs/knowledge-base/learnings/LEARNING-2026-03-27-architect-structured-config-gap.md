# LEARNING: Explicit architect config must normalize before AG-UI draft state

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-builder-architect-protocol-normalization]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads focus was re-checked after the repo had already shipped persisted `toolConnections[]`, structured `triggers[]`, runtime inputs, review/deploy readiness, and several AG-UI follow-on packages. The remaining question was whether the create flow's generic feel now came from missing downstream persistence, or from the architect contract itself still being dropped before the builder state saw it.

## What Was Learned

The missing seam was earlier than save/deploy persistence: the architect was already emitting structured runtime config, but the builder contract dropped `tool_connections` and `triggers` before review/configure state was derived. The durable fix is to normalize those explicit fields into the existing saved-agent `toolConnections[]` / `triggers[]` shapes before AG-UI metadata, draft autosave, or Improve Agent seeding runs. Once the explicit objects reach builder metadata, downstream review/configure/deploy paths can keep reusing the saved-agent contract instead of inventing another projection layer.

## Evidence

- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` tells the architect to include `tool_connections`, `triggers`, `cron_jobs`, and `soul_content` in the `ready_for_review` payload.
- `agent-builder-ui/lib/openclaw/response-normalization.ts` now normalizes explicit `tool_connections` and `triggers` into saved-agent-compatible objects, including direct Google Ads connector ids and structured schedule payloads.
- `agent-builder-ui/lib/openclaw/wizard-directive-parser.ts` and `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` now prefer those explicit objects over hint inference when the architect provides them.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts`, `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts`, and `agent-builder-ui/lib/openclaw/builder-state.ts` now keep those normalized objects in AG-UI draft metadata so save/reopen flows do not collapse back to keyword hints.
- The saved-agent layer was already the right downstream target: `toolConnections[]` and `triggers[]` persist, review them truthfully, and feed deploy readiness. The durable lesson is that future builder protocol work should normalize explicit architect data into that contract as early as possible.

## Implications For Future Agents

- Do not treat Google Ads create-flow credibility gaps as only persistence or UI-summary issues. If the architect already returns explicit runtime config, normalize that structured answer before any AG-UI reducer or draft autosave layer makes heuristic guesses.
- Prefer extending the existing architect normalization contract and reusing the saved-agent `toolConnections[]` / `triggers[]` models rather than inventing another intermediate config shape.
- Keep heuristic connector and trigger inference only as fallback for older architect payloads; explicit structured config should win whenever the architect provides it.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-builder-architect-protocol-normalization]]
- [[SPEC-architect-structured-config-handoff]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
