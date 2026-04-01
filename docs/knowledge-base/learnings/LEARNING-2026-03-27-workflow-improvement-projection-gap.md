# LEARNING: Accepted workflow improvements are still metadata-only

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-improvement-persistence]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads focus was re-checked after connector-improvement persistence had shipped and trigger-improvement projection plus schedule-fidelity follow-ons were already tracked in `TODOS.md`. The remaining question was whether the repo still had one unowned gap in the "iterative and self-improving" builder lane that was large enough to merit a new feature package.

## What Was Learned

Yes. The saved improvement contract still has one unmaterialized category: accepted `workflow` improvements can be persisted as metadata, but they still do not change the saved `workflow` or `agentRules` that Review, SOUL/test chat, deploy, and Improve Agent hot-push actually use.

## Evidence

- `docs/project-focus.md` explicitly says the builder should surface workflow upgrades for the Google Ads proving case and that accepted improvements should feed back into persisted agent state.
- `agent-builder-ui/lib/agents/types.ts` defines `AgentImprovement.kind` as `tool_connection | trigger | workflow`.
- `docs/knowledge-base/specs/SPEC-agent-improvement-persistence.md` documents the same improvement kinds in the saved contract.
- `agent-builder-ui/lib/openclaw/ag-ui/builder-metadata-autosave.ts` still derives only connector recommendations from `toolConnectionHints[]`.
- `agent-builder-ui/app/(platform)/agents/create/create-session-config.ts` still projects accepted improvements only into `toolConnections[]`.
- `agent-builder-ui/lib/openclaw/agent-config.ts` already consumes saved `workflow` and `agentRules` state to build the runtime-facing SOUL summary, which means the runtime contract exists today and is the correct projection target.

## Implications For Future Agents

- Do not assume the self-improving builder loop is complete once trigger projection lands. `workflow` improvements remain a separate projection seam unless a task explicitly owns them.
- Reuse the existing `improvements[]` contract and accepted-improvement projector for workflow upgrades instead of inventing a second metadata channel.
- Treat saved `workflow` and `agentRules` as the canonical projection targets, because those are already what Review, deploy, test chat, and Improve Agent hot-push consume.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-agent-improvement-persistence]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
