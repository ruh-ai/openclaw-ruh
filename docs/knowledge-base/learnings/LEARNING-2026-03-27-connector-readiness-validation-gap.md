# LEARNING: Stored connector secrets are not the same as verified readiness

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-tool-integration-workspace]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active Google Ads / MCP-first creation lane was reviewed again after truthful connector catalogs, encrypted credential storage, durable research plans, selected-tool runtime apply, and deploy-readiness work were already represented in `TODOS.md`.

The remaining question was whether the product's current "configured" connector state actually means the Google Ads integration is verified and runtime-ready, or only that encrypted secrets were saved successfully.

## What We Observed

The current readiness model still collapses secret presence into configured state.

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx` marks a direct connector `configured` immediately after `saveToolCredentials()` returns success, even though that route only confirms encrypted persistence.
- `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts:fetchCredentialSummary()` and `ruh-backend/src/agentStore.ts:getAgentCredentialSummary()` only expose `toolId`, `hasCredentials`, and `createdAt`.
- `agent-builder-ui/lib/tools/tool-integration.ts:reconcileToolConnections()` upgrades any credential-backed connector with saved secrets back to `configured` on reopen.
- `ruh-backend/src/app.ts` later decrypts those secrets and writes them into `.openclaw/mcp.json`, but no safe validation result is persisted back onto the saved connector contract.

## Why It Matters

- `docs/project-focus.md` asks for a Google Ads configuration flow grounded in real connector state, not decorative readiness badges.
- Secret persistence and verified readiness are different milestones. A saved-but-untested, stale, rotated, or malformed Google Ads credential set can still reopen as `configured` today.
- That gap weakens operator trust: the builder can say a connector is configured long before runtime use proves whether the credential set actually works.

## Reusable Guidance

- Treat `has saved secrets` and `connector verified for runtime use` as separate states in future MCP-first work.
- Keep the browser-safe summary contract explicit: safe validation metadata, timestamps, and masked reason text are useful; plaintext credentials are never required.
- Reopen and deploy surfaces should preserve validation failures instead of regressing them back to a generic green configured badge.
- When future connector work adds validation, start with one proving-case connector such as Google Ads rather than inventing a generic contract no runtime path can honor.

## Related Notes

- [[008-agent-builder-ui]] — documents the current builder Configure contract and where `configured` is presented to operators
- [[SPEC-tool-integration-workspace]] — currently defines the secret-handoff contract that should be extended with verified readiness semantics
- [[SPEC-google-ads-agent-creation-loop]] — the Google Ads proving case is where stored-vs-verified connector truthfulness matters first
- [[LEARNING-2026-03-27-selected-tool-mcp-apply-gap]] — exact runtime MCP apply is a separate seam from whether the selected connector was ever verified as valid
- [Journal entry](../../journal/2026-03-27.md)
