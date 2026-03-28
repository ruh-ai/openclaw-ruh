# SPEC: Tool Integration Workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

approved

## Summary

The builder should have one truthful place to research and integrate external tools. This spec makes `/tools` the canonical workspace for comparing `MCP` vs `API` vs `CLI`, reuses that research contract inside `/agents/create`, and fixes the new-agent credential flow so a "connected" tool is not just optimistic local state.

The current shipped slice covers the `/tools` research workspace, safe connector metadata, and encrypted credential handoff. Durable backend persistence of the richer `toolConnections[].researchPlan` payload described below is still follow-on work, so this spec remains `approved` rather than fully `implemented`.

## Related Notes

- [[008-agent-builder-ui]] — owns the `/tools` surface, the builder configure step, and the architect bridge contract
- [[011-key-flows]] — documents the end-to-end tool research and create-agent connection journey
- [[004-api-reference]] — existing credential save/delete/list routes are reused by the fail-closed connector setup flow
- [[005-data-models]] — documents metadata-only connector reads plus encrypted credential summaries for saved agents
- [[SPEC-google-ads-agent-creation-loop]] — this package closes the fake-connect gap left by the metadata-only Google Ads proving case
- [[SPEC-selected-tool-mcp-runtime-apply]] — deploy/runtime apply must use saved selected connector metadata as the MCP runtime selector

## Specification

### Product surface

Add a real `/tools` page under `agent-builder-ui` and treat it as the canonical tool integration workspace.

The page must let an operator:
- describe a tool or service they want an agent to use
- provide optional use-case context
- ask the architect to research the best integration path
- receive a structured recommendation choosing one primary method: `mcp`, `api`, or `cli`
- review concrete setup, integration, and validation steps
- see when the product supports one-click MCP connection now versus when manual integration is still required

### Architect response contract

Tool research should use a dedicated structured response type rather than overloading builder skill-graph payloads.

The response must include:
- tool name
- recommended integration method (`mcp`, `api`, or `cli`)
- concise summary and rationale
- optional package/command details when relevant
- required credentials or env vars
- setup steps
- agent integration steps
- validation steps
- alternative methods with tradeoffs
- source links or doc URLs when the architect provides them
- optional supported `toolId` when the result matches a first-party one-click connector already represented in the builder registry

### Builder Configure integration

`StepConnectTools` should reuse the same research contract/UI inside the connect sidebar so the operator does not have to guess whether a tool belongs behind MCP, a custom API skill, or a CLI wrapper.

Rules:
- the primary Connect Tools list must start from the supported connector registry plus any saved `toolConnections[]`; it must not fall back to unrelated mock filler cards when there is no current evidence
- both the Advanced Configure shell and the default embedded Co-Pilot Tools step must pass the current agent use case into this research contract so shortlist ordering and auto-research stay in parity
- when the use case clearly names an unsupported external tool, the list may add one explicit research-first/manual-plan seed for that tool so the operator can open the sidebar without pretending one-click setup already exists
- when the use case clearly names a supported direct connector such as Google Ads, that connector should be prioritized ahead of the generic supported list rather than appearing only in its default registry position
- the latest architect recommendation may reprioritize the list or map that seed to an existing supported connector, but it must do so using the real supported connector id
- architect-generated builder hints must use that same normalized connector identity upstream so AG-UI state and autosaved recommendations never reintroduce fake direct ids such as `google-ads`
- opening a tool in the sidebar should expose the research summary plus the setup form
- supported one-click MCP tools should still allow credential entry directly in the sidebar
- unsupported tools should show a truthful manual-integration brief instead of pretending they can be connected
- when the operator saves a research-backed manual or unsupported tool, the saved `toolConnections[]` contract must persist a bounded `researchPlan` payload containing the recommended method/package, setup steps, integration steps, validation steps, alternatives, and sources so reopen flows do not need to rerun architect research

### Credential handoff contract

New-agent tool credentials entered before the first save must be held only in ephemeral in-memory state for the current create session.

Rules:
- pre-save credential drafts must not be persisted to Zustand `persist`, localStorage, query params, or ordinary agent metadata
- saving a new agent must create the agent record first, then commit pending credentials through `PUT /api/agents/:id/credentials/:toolId`
- if credential commit fails, the UI must fail closed and leave the connector status as `missing_secret` rather than `configured`
- reopening an existing agent must reconcile connector metadata against credential summary so the UI shows `configured` only when credentials actually exist
- disconnecting a saved connector must delete the stored secret and update the metadata state together
- if research recommends that an unsupported seed should use a supported connector, the sidebar must switch to that connector's credential contract and persist the supported connector id rather than the original seed id
- deploy/runtime config must materialize only saved tool connections that remain `configured` and `connectorType: "mcp"`; stale saved credentials for deselected tools must not widen runtime MCP state

### Status model

For credential-backed tool connections:
- `available` means the tool is known but not selected
- `missing_secret` means the tool is selected but no saved credentials currently back it
- `configured` means the tool is selected and credentials exist or were just committed successfully
- `unsupported` means the tool can be researched and documented but not one-click connected in the current product

### Saved research-plan contract

For research-backed tool connections, `toolConnections[]` may also carry a metadata-only `researchPlan`.

Rules:
- `researchPlan` must stay safe for ordinary agent reads: no raw credential values, bearer tokens, callback secrets, or transcript dumps
- the payload should preserve the architect's recommended method/package, setup steps, integration steps, validation steps, alternatives, and source links
- older saved connections without `researchPlan` must still reopen cleanly with an explicit empty-plan state
- Review and Deploy must reuse the same saved `researchPlan` payload for their operator-facing summaries instead of inferring a second manual-plan contract from `configSummary`

## Implementation Notes

- Reuse the existing architect bridge (`/api/openclaw`) instead of introducing a new backend route for tool research.
- Reuse the existing backend credential routes instead of inventing a second secret store.
- Keep the first slice frontend-driven and bounded: no new database tables are required.
- Update the frontend config-apply typing to include `mcp` step results so tool-configuration outcomes stay visible when agent config is pushed into a sandbox.

## Test Plan

- Frontend unit tests for tool-research response normalization and method recommendation rendering
- Frontend unit tests for connector status reconciliation between metadata, pending drafts, and saved credential summary
- Store/helper tests covering create-agent save followed by credential commit and fail-closed status fallback
- Route/parser coverage proving the architect bridge accepts the dedicated tool-research response type
- Manual verification:
  - open `/tools`, research a known tool, and confirm the page renders a structured `MCP`/`API`/`CLI` recommendation
  - open `/agents/create`, connect a credential-backed tool before the first save, save the agent, and confirm the status reopens as `configured`
  - force a credential-save failure and confirm the UI leaves the tool as `missing_secret` instead of claiming success

## Related Learnings

- [[LEARNING-2026-03-27-tool-research-plan-persistence-gap]] — the `/tools` workspace is live, but backend persistence of the richer `researchPlan` payload is still a follow-on gap rather than shipped contract
- [[LEARNING-2026-03-27-connector-readiness-validation-gap]] — encrypted credential storage alone is not a truthful configured-state contract; future connector work should separate stored secrets from verified runtime readiness
- [[LEARNING-2026-03-28-connector-summary-downgrade-truthfulness]] — connector status changes must also normalize `configSummary` copy so reopen/review surfaces never show both stored and missing-credential messages at once
