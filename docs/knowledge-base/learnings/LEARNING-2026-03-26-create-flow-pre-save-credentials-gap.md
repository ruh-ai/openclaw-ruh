# LEARNING: New-agent connector credentials entered in `/agents/create` are discarded before first save

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run reviewed the active Google Ads creation-focus lane after the repo had already shipped metadata-only `toolConnections[]` and `triggers[]` persistence plus secure credential endpoints for saved agents. The goal was to identify the single highest-value missing feature package that was still not represented in `TODOS.md`.

Update: this gap is now closed by [[SPEC-tool-integration-workspace]], which added the fail-closed first-save credential handoff and the shared `/tools` research workspace.

## What Was Learned

Before [[SPEC-tool-integration-workspace]] shipped, the create flow presented a real credential-entry sidebar for MCP tools, but the new-agent path could not actually commit those credentials. When `ConnectToolsSidebar` was opened before the first save, it had no `agentId`, so it exited early and only marked the tool as connected in local UI state. That meant operators could appear to configure a Google Ads connector during `/agents/create`, but the entered values were discarded before the agent was first persisted. The durable lesson is that pre-save credential handoff must be treated as its own product contract, not assumed to fall out of the saved-agent secret-store routes automatically.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx` contains `if (!agentId) { onConnect(); return; }`, so the new-agent path never calls `saveToolCredentials()`.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` passes `initialToolConnections` and `initialTriggers` into `ConfigureAgent`, but the new-agent create flow never supplies a pre-save agent id to `StepConnectTools`.
- `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts` already exposes `saveToolCredentials()`, `deleteToolCredentials()`, and `fetchCredentialSummary()` helpers backed by dedicated backend routes, so the missing piece is the handoff from pre-save UI state into those APIs after the first create call.
- `ruh-backend/src/app.ts` already implements `GET`, `PUT`, and `DELETE /api/agents/:id/credentials/:toolId` routes for saved agents, confirming the secure-store surface exists today for persisted agents only.

## Implications For Future Agents

- Do not treat the current Google Ads create flow as a truly configured connector experience just because the Configure step can store metadata-only `toolConnections[]`.
- When fixing this lane, keep any pre-save credential values ephemeral and out of persisted client state; the product already has a secure backend credential store, so the missing work is sequencing and truthful status, not inventing another storage layer.
- Any worker package for this gap should update the Google Ads proving-case flow and Improve Agent reopen behavior together so operators can both save and later verify connector state without ever re-reading plaintext secrets.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-tool-integration-workspace]]
- [Journal entry](../../journal/2026-03-26.md)
