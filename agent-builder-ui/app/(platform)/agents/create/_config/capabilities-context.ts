/**
 * Capabilities Context — assembles a human-readable summary of the platform's
 * available tools, triggers, and channels for injection into architect prompts.
 *
 * This gives the architect awareness of what the platform actually supports
 * so it can make accurate recommendations for tool types, channels, and triggers.
 */

import { listSupportedTools } from "./mcp-tool-registry";

// ─── Tool Taxonomy ───────────────────────────────────────────────────────────

const TOOL_TYPE_DESCRIPTIONS = `
Tool types supported by the platform:
- MCP (Model Context Protocol): Direct connector via an MCP server npm package. The agent spawns the server in its sandbox and gets structured tool access. Best for services with official MCP packages.
- API: REST or GraphQL integration. The agent calls external APIs directly using HTTP. Requires the skill to implement the API calls. Use when no MCP package exists.
- CLI: Command-line tool. The agent runs CLI commands in its sandbox. Use for tools that provide a CLI binary (e.g., gcloud, aws, gh).
`.trim();

// ─── Channel Definitions ─────────────────────────────────────────────────────

const CHANNEL_DESCRIPTIONS = `
Communication channels the agent can be accessed through:
- Telegram: Supported. Agent runs as a Telegram bot. Requires TELEGRAM_BOT_TOKEN.
- Slack: Supported. Agent runs as a Slack bot. Requires SLACK_BOT_TOKEN and SLACK_TEAM_ID.
- Discord: Planned. Not yet runtime-backed.
`.trim();

// ─── Trigger Definitions ─────────────────────────────────────────────────────

const TRIGGER_DESCRIPTIONS = `
Trigger types that can activate the agent:
- Cron Schedule (supported): Runs on a recurring cron schedule (e.g., "0 9 * * 1-5" for weekdays at 9am). Deployable today.
- Webhook (supported): Receives signed HTTP POST requests from external systems. Deployable today.
- Manual: User-initiated via chat or API call. Always available.
- Event-driven triggers (data-change, conditional, agent-to-agent): Planned but not yet runtime-backed.
`.trim();

// ─── Main Builder ────────────────────────────────────────────────────────────

export function buildCapabilitiesContext(): string {
  const mcpTools = listSupportedTools();
  const mcpToolList = mcpTools
    .map(
      (tool) =>
        `  - ${tool.name} (id: "${tool.toolId}"): ${tool.description} Connector: MCP via ${tool.mcpPackage}.`,
    )
    .join("\n");

  return `
## Platform Capabilities

### Available MCP Tools (ready to use)
${mcpToolList}

### ${TOOL_TYPE_DESCRIPTIONS}

### ${CHANNEL_DESCRIPTIONS}

### ${TRIGGER_DESCRIPTIONS}

When recommending tools, always specify:
- tool_type: "mcp" | "api" | "cli"
- tool_id: the registry id (only for MCP tools that exist above)
- For tools not in the MCP registry, use tool_type "api" or "cli" as appropriate
`.trim();
}
