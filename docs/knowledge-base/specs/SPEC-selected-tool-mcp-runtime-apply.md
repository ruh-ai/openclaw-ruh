# SPEC: Selected Tool MCP Runtime Apply

[[000-INDEX|← Index]] | [[004-api-reference]] | [[008-agent-builder-ui]]

## Status

implemented

## Summary

Deploy-time MCP materialization must follow the saved operator-selected connector contract instead of every stored credential on the agent. `POST /api/sandboxes/:sandbox_id/configure-agent` now derives runtime MCP servers only from saved `toolConnections[]` entries that are both `configured` and `connectorType: "mcp"`, rewrites `.openclaw/mcp.json` to that exact state on every apply, and fails closed when any selected MCP tool cannot be materialized.

## Related Notes

- [[004-api-reference]] — documents the request and response contract for `configure-agent`, including the `mcp` step behavior
- [[008-agent-builder-ui]] — Review and Deploy surface `toolConnections[]` as the operator-facing runtime contract that runtime apply must honor
- [[SPEC-tool-integration-workspace]] — encrypted credential storage and connector metadata split remain the upstream source of truth for one-click MCP tools
- [[SPEC-agent-config-apply-contract]] — config apply must report verified success only when every runtime mutation succeeds
- [[SPEC-google-ads-agent-creation-loop]] — Google Ads remains the proving case for truthful MCP-backed connector persistence through deploy

## Specification

### Runtime selector

When `agent_id` is provided to `POST /api/sandboxes/:sandbox_id/configure-agent`, the backend must:

1. Load the saved agent record.
2. Read `tool_connections` from that saved record.
3. Select only tool connections that are both:
   - `status: "configured"`
   - `connectorType: "mcp"`
4. Treat that selected set as the entire MCP runtime contract for the sandbox.

Saved credentials remain secret input only. They are no longer the selector for which MCP servers should exist at runtime.

### Materialization rules

- For each selected MCP tool, the backend must require a known runtime package mapping.
- For each selected MCP tool, the backend must require a saved encrypted credential envelope for the same `toolId`.
- The backend must decrypt credentials only for the selected MCP tool ids.
- Unsupported/manual-plan tools and deselected tools must never be written into `.openclaw/mcp.json`, even if old encrypted credentials still exist on the agent.

### Rewrite-on-every-apply contract

`configure-agent` must rewrite `~/.openclaw/mcp.json` on every apply to match the exact selected MCP set.

Rules:

- If one or more selected MCP tools exist, write only those servers.
- If zero selected MCP tools remain, write an empty config (`{ "mcpServers": {} }`) so stale runtime tool state is cleared.
- Skipping the MCP write because no credentials were selected is not allowed; that leaves stale runtime state behind.

### Failure contract

Any selected-tool MCP error must fail the whole config apply.

Examples:

- selected MCP tool has no runtime package mapping
- selected MCP tool has no saved encrypted credentials
- credential decrypt fails
- `.openclaw/mcp.json` write fails

Failure behavior:

- append a structured `mcp` step with the failing `toolId` or `.openclaw/mcp.json`
- return `ok: false`, `applied: false`, and non-2xx
- record the config apply audit event as `outcome: "failure"`
- do not continue to later runtime-apply steps as if MCP materialization succeeded

## Implementation Notes

- Backend implementation lives in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts) inside `POST /api/sandboxes/:sandbox_id/configure-agent`.
- The route uses the saved agent record plus `agent_credentials` together: `tool_connections` selects the runtime set, while encrypted credentials provide env values for those selected tools only.
- The current runtime package map remains bounded to first-party supported MCP connectors such as `google-ads`, `github`, `google`, `slack`, `jira`, `notion`, and `linear`.
- Focused route coverage lives in [`/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/skillRegistryApp.test.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/skillRegistryApp.test.ts).

## Test Plan

- Backend route coverage proving only selected configured MCP tools are written into `.openclaw/mcp.json`
- Backend route coverage proving stale saved credentials for deselected tools do not reappear in runtime config
- Backend route coverage proving zero selected MCP tools rewrites `.openclaw/mcp.json` to an empty server map
- Backend route coverage proving decrypt or write failures return non-2xx with an `mcp` step failure

