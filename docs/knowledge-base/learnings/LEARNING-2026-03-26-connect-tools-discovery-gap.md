# LEARNING: Connect Tools still starts from mock discovery instead of real connector state

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-tool-integration-workspace]]

## Context

The active `docs/project-focus.md` asks the Google Ads create lane to use real connector discovery or selection. During the 2026-03-26 analyst backlog review, the repo was inspected after the persisted tool/trigger contract, draft autosave, deploy handoff, and improvement-persistence slices had already landed.

## What Was Learned

`/agents/create` still enters Connect Tools through a mock-first catalog even though the repo already has the primitives for a truthful connector workflow.

- `StepConnectTools.tsx` derives cards from `TOOL_PATTERNS` and falls back to `MOCK_TOOLS`, so the operator can still see unrelated filler cards when the skill graph is empty or unmatched.
- The focused Google Ads path currently synthesizes a `google-ads` tool id from keywords, but `mcp-tool-registry.ts` does not define a direct `google-ads` connector. The product is therefore inventing a connector identity instead of clearly distinguishing a supported connector from a researched manual plan.
- `ConnectToolsSidebar.tsx` already embeds `ToolResearchWorkspace` and can save manual plans with `status: "unsupported"`, which means the missing piece is not research infrastructure. The missing piece is making the main catalog itself registry-and-research-driven.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/mockData.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx`
- `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts`
- `docs/project-focus.md`
- `docs/knowledge-base/specs/SPEC-tool-integration-workspace.md`

## Implications For Future Agents

- Treat "tool research workspace shipped" and "truthful connector discovery shipped" as different milestones; the repo has the first but not the second.
- Do not add more keyword heuristics or mock fallback cards to the live Google Ads path. Prefer registry-backed supported connectors plus explicit researched manual-plan entries.
- When a domain-specific connector does not exist as a one-click integration, surface that absence explicitly and persist the researched manual plan instead of synthesizing a fake direct-connector id.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-tool-integration-workspace]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[LEARNING-2026-03-26-connect-tools-catalog-contract]]
- [Journal entry](../../journal/2026-03-26.md)
