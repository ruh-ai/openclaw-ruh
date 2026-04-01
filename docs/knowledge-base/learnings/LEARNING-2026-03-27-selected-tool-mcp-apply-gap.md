# LEARNING: Deploy-time MCP config must follow selected tool connections

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-tool-integration-workspace]] | [[SPEC-agent-config-apply-contract]] | [[SPEC-selected-tool-mcp-runtime-apply]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active focus still prioritized the Google Ads MCP-first creation lane. The repo already persisted truthful `toolConnections[]`, encrypted credential summaries, and deploy-readiness UI, so the next missing package had to be a runtime seam that was not already represented in `TODOS.md`.

## What Was Learned

Deploy-time MCP materialization is still using stored credentials as the runtime selector instead of the saved selected connector contract.

- `POST /api/sandboxes/:sandbox_id/configure-agent` receives `agent_id` but not the saved `toolConnections[]` snapshot, then loads every encrypted credential on the agent and writes `.openclaw/mcp.json` from that full set.
- Because the route never filters by selected `toolConnections[]`, stale or later-deselected connectors can still be rehydrated into the sandbox runtime even when Review and Deploy show a different operator-facing contract.
- When no credentials are present, the route skips MCP writing entirely, which can leave an old `.openclaw/mcp.json` in place from a previous deploy instead of clearing runtime tool state.
- MCP decrypt failures and `.openclaw/mcp.json` write failures only append `mcp` step messages today; the route still records a success audit event and returns `{ ok: true, applied: true }`.

## Evidence

- [`ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts)
- [`agent-builder-ui/lib/openclaw/agent-config.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/agent-config.ts)
- [`agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx)
- [`docs/knowledge-base/008-agent-builder-ui.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/008-agent-builder-ui.md)
- [`docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md)
- [`docs/knowledge-base/specs/SPEC-agent-config-apply-contract.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-agent-config-apply-contract.md)

## Implications For Future Agents

- Treat `toolConnections[]` as the runtime selector for MCP config, with encrypted credentials acting only as secret input for the selected configured connectors.
- Clearing or deselecting a connector must clear runtime MCP state too; otherwise Review/Deploy truthfulness and sandbox reality drift apart.
- Do not consider deploy-readiness gating sufficient on its own. Even after deploy is allowed to start, `configure-agent` still needs to fail closed when selected MCP materialization fails or when stale credentials would widen the runtime tool surface.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-tool-integration-workspace]]
- [[SPEC-agent-config-apply-contract]]
- [[SPEC-selected-tool-mcp-runtime-apply]]
- [Journal entry](../../journal/2026-03-27.md)
