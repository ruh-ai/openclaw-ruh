# LEARNING: Tool research results need a durable saved-plan contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-tool-integration-workspace]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads and MCP-first configuration lane was checked again after connector truthfulness, secure credential handoff work, runtime-input persistence, and trigger/runtime readiness packages were already on the board. The remaining question was whether researched manual integrations stayed useful after save/reopen or whether the product still treated tool research as a one-session sidebar artifact.

## What We Observed

The original saved connector contract dropped most of the research result.

- `agent-builder-ui/app/(platform)/tools/_components/ToolResearchWorkspace.tsx` already renders a structured `ToolResearchResult` with recommended method, package, required credentials, setup steps, integration steps, validation steps, alternatives, and source links.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx` reduces that result to `configSummary`, connector type, auth kind, and status through `buildConnection()`.
- `agent-builder-ui/lib/agents/types.ts` defines `AgentToolConnection` without any field for the researched plan itself, so `useAgentsStore` can only round-trip the shallow summary.
- At the time of the original audit, `docs/knowledge-base/011-key-flows.md` said unsupported/manual tools saved the research plan as metadata, but the live product only preserved enough information to remember that a manual plan was selected, not the concrete instructions or citations that justified it.

## Follow-up Audit

A repo-wide KB refresh on 2026-03-28 rechecked the live frontend and backend persistence boundary and found that this gap is not fully closed yet.

- Frontend types and UI helpers now understand a richer `toolConnections[].researchPlan` shape.
- The live backend validator in `ruh-backend/src/validation.ts` still accepts only the base connector metadata fields plus `configSummary`.
- The live store contract in `ruh-backend/src/agentStore.ts` still persists only the base connector metadata payload.

That means `/tools` research is shipped, but durable saved-agent persistence of the full research plan is still intended behavior rather than current backend truth.

## Why It Matters

- `docs/project-focus.md` says the Configure flow should be MCP-first and grounded in real connector state. A manual-plan tool that reopens as a plain status badge is still partly decorative because the actionable integration plan is gone.
- Unsupported and research-first tools are where operators most need durable guidance. If the steps and sources disappear on reopen, the operator must rerun research or reconstruct the decision from memory.
- This is separate from credential truthfulness. The repo already has good work on `configured` vs `missing_secret`; the missing seam is preserving the architect's concrete MCP/API/CLI setup guidance as saved product state.

## Reusable Guidance

- Treat architect tool research as part of the intended saved connector contract when the operator chooses a research-backed tool, especially for unsupported/manual-plan paths.
- Keep the saved research plan metadata-only and safe for normal reads: recommended method/package, setup steps, integration steps, validation steps, alternatives, and sources are useful; raw secrets and transcript dumps are not.
- Until backend persistence lands, do not assume save/reopen or ordinary agent reads can recover the full research plan; they currently retain only the base connector summary.
- Review, Improve Agent reopen, and Deploy should eventually consume the same saved research-plan payload rather than forcing a rerun of tool research.
- When older records lack a saved plan, surface an explicit empty-plan state instead of implying that a shallow `configSummary` is the full researched contract.

## Related Notes

- [[008-agent-builder-ui]] — documents the `/tools` workspace, Connect Tools sidebar, and saved-config surfaces that should consume the same durable plan
- [[011-key-flows]] — documents the current gap: manual/research-backed tool plans still collapse to shallow connector metadata after save
- [[SPEC-tool-integration-workspace]] — defines the research workspace and credential handoff contract that this missing durability slice extends
- [[LEARNING-2026-03-27-copilot-credential-handoff-after-draft-gap]] — saving secret-backed connectors truthfully is a separate post-draft handoff problem
- [Journal entry](../../journal/2026-03-27.md)
