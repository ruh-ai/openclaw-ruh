# LEARNING: Co-Pilot build results must infer `builtSkillIds` from returned `skill_md`

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Date
- 2026-03-31

## Context
- While running the `/agents/create` QA flow for the forge-backed builder, the direct Build path completed and advanced into Review, but the lifecycle UI still showed `0/N skills built` and Ship stayed disabled behind unresolved-skill messaging.

## What Happened
- The create-flow Build stage calls the forge-backed `generateSkillsFromArchitect()` path directly.
- That path returns a complete skill graph whose nodes include full `skill_md` payloads.
- The streamed chat path already treated returned `skill_md` as proof that a skill had been built and explicitly called `markSkillBuilt(...)`.
- The direct Build path only called `setSkillGraph(...)`, so `builtSkillIds` remained empty even though the returned nodes already carried the final skill files.

## Durable Insight
- In builder/co-pilot flows, `skill_md` is the canonical signal that a returned skill node is already built and deployable.
- The store should derive `builtSkillIds` from any incoming skill graph node whose `skill_md` is a non-empty string, instead of assuming every caller will remember to call `markSkillBuilt(...)` separately.
- Centralizing that rule in the store protects both the direct forge build path and future skill-graph hydration paths from drifting apart.

## Fix
- Updated `agent-builder-ui/lib/openclaw/copilot-state.ts` so `setSkillGraph()` automatically populates `builtSkillIds` from nodes with non-empty `skill_md`.
- Added regression coverage in `agent-builder-ui/lib/openclaw/copilot-state.test.ts`.

## Verification
- `cd agent-builder-ui && npx tsc --noEmit`
- `cd agent-builder-ui && bun test lib/openclaw/copilot-state.test.ts lib/openclaw/api.test.ts lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts lib/openclaw/ag-ui/__tests__/builder-agent.test.ts 'app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts'`

## Follow-up
- The post-fix browser rerun also exposed a separate dev-mode issue: after Fast Refresh, `/agents/create?agentId=...` restored the agent identity but not the lifecycle progress, and a follow-on plan request hit `/api/openclaw/forge-chat` with a 500. Treat that as a separate bug from built-skill hydration.
