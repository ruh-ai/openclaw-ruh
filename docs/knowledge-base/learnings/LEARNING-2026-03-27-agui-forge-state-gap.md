# LEARNING: AG-UI cutover still leaves forge workspace lifecycle on the legacy builder state

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[SPEC-agui-protocol-adoption]]

## Context

This analyst run re-checked the active `Project Focus` lane after confirming that the broad AG-UI cutover and builder `StateSnapshot` / `StateDelta` adoption already have TODO entries. The remaining question was whether anything still blocked those packages from actually retiring `builder-state.ts`, or whether the rest of the migration work was already fully represented in the backlog.

## What We Learned

- `agent-builder-ui/lib/openclaw/builder-state.ts` still owns the only typed forge lifecycle fields: `forgeSandboxId`, `forgeSandboxStatus`, `forgeVncPort`, and `forgeError`.
- `agent-builder-ui/lib/openclaw/ag-ui/types.ts` defines the target `AgentUIState` and `BuilderMetadataState`, but neither shape carries forge workspace readiness or failure state.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` already routes builder messages through `BuilderAgent({ forgeSandboxId: activeSandbox?.sandbox_id })`, so the browser-capable forge path is live even though its lifecycle is not represented in the AG-UI state contract.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` still save and consume `forgeSandboxId` for deploy-time promotion, which means forge identity is product state, not transient implementation detail.
- `agent-builder-ui/app/(platform)/agents/create/_components/ForgeProgress.tsx` still imports its status type from the legacy builder-state file and is currently unused, which shows the readiness UI contract is stranded outside the live AG-UI-backed create flow.

## Why It Matters

The AG-UI migration cannot truly finish while forge lifecycle state remains outside the shared builder contract. If future work deletes `builder-state.ts` after landing snapshot/delta adoption but before migrating these fields, the create flow loses its only truthful place to express whether the browser-backed builder workspace is ready, provisioning, or failed, and deploy fast-path promotion risks depending on stale or implicit local state.

## Implications For Future Runs

- Treat forge workspace lifecycle as a prerequisite slice for the AG-UI cutover, not as follow-up polish.
- Do not remove `builder-state.ts` until forge sandbox identity and readiness/error fields have moved onto the AG-UI builder state contract used by create, resume, and deploy.
- Keep operator-visible forge readiness fail-closed. A missing or failed forge workspace should never look identical to a ready browser-capable builder session.

## Related Work

- [[SPEC-agui-protocol-adoption]] — canonical migration plan for replacing legacy transport/state with AG-UI
- [[LEARNING-2026-03-26-agui-cutover-gap]] — broad AG-UI cutover still depended on legacy transport/state seams
- [[LEARNING-2026-03-26-agui-state-snapshot-gap]] — builder metadata still needed real `StateSnapshot` / `StateDelta` adoption before more create-flow work landed on top
- [[TASK-2026-03-27-165]] — worker-ready feature package for moving forge workspace readiness onto the AG-UI builder contract
