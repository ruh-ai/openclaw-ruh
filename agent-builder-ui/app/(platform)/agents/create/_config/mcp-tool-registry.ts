/**
 * MCP Tool Registry — defines which tools are supported, what credentials
 * they require, and how to display them in the UI.
 *
 * Each tool maps to an MCP server npm package that gets spawned inside
 * the agent's sandbox container.
 */

import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

export interface McpCredentialField {
  /** Environment variable name (e.g., GITHUB_PERSONAL_ACCESS_TOKEN) */
  key: string;
  /** Human-readable label */
  label: string;
  /** Placeholder text for the input */
  placeholder: string;
  /** Input type: password (hidden), text (visible), textarea (multiline) */
  type: "password" | "text" | "textarea";
  /** URL to the service's token/key generation page */
  helpUrl?: string;
  /** Help text shown below the input */
  helpText?: string;
}

export interface McpToolDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  authKind: "oauth" | "api_key" | "service_account" | "none";
  /** npm package for the MCP server */
  mcpPackage: string;
  /** Credential fields required to connect */
  credentials: McpCredentialField[];
}

export interface SupportedToolContext {
  toolId: string;
  name: string;
  description: string;
  connectorType: "mcp";
  mcpPackage: string;
}

export interface ToolRuntimeInputGuidance {
  title: string;
  description: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Non-secret operator-facing identifiers belong in runtimeInputs[], not the
// encrypted credential channel.
const TOOL_RUNTIME_INPUT_GUIDANCE: Record<string, ToolRuntimeInputGuidance> = {
  "google-ads": {
    title: "Runtime input required separately",
    description:
      "Enter GOOGLE_ADS_CUSTOMER_ID in Runtime Inputs. Keep it operator-visible instead of storing it as an encrypted credential.",
  },
};

export const MCP_TOOL_REGISTRY: Record<string, McpToolDefinition> = {
  github: {
    id: "github",
    name: "GitHub",
    icon: "github",
    description: "Repositories, issues, pull requests, code search, and file operations.",
    authKind: "api_key",
    mcpPackage: "@modelcontextprotocol/server-github",
    credentials: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "Personal Access Token",
        placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
        type: "password",
        helpUrl: "https://github.com/settings/tokens",
        helpText: "Generate a token with repo, read:org, and read:user scopes.",
      },
    ],
  },
  slack: {
    id: "slack",
    name: "Slack",
    icon: "slack",
    description: "Send messages, read channels, search history, and manage threads.",
    authKind: "oauth",
    mcpPackage: "@modelcontextprotocol/server-slack",
    credentials: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Bot Token",
        placeholder: "xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx",
        type: "password",
        helpUrl: "https://api.slack.com/apps",
        helpText: "Create a Slack app and install it to your workspace to get a bot token.",
      },
      {
        key: "SLACK_TEAM_ID",
        label: "Team ID",
        placeholder: "T01234567",
        type: "text",
        helpText: "Find this in Slack workspace settings or the URL of your Slack workspace.",
      },
    ],
  },
  google: {
    id: "google",
    name: "Google Workspace",
    icon: "google",
    description: "Gmail, Google Drive, Calendar, Sheets, and Docs access.",
    authKind: "service_account",
    mcpPackage: "@anthropic/google-workspace-mcp",
    credentials: [
      {
        key: "GOOGLE_SERVICE_ACCOUNT_KEY",
        label: "Service Account Key (JSON)",
        placeholder: '{"type":"service_account","project_id":"..."}',
        type: "textarea",
        helpUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
        helpText: "Create a service account, enable the APIs you need, and download the JSON key file.",
      },
    ],
  },
  "google-ads": {
    id: "google-ads",
    name: "Google Ads",
    icon: "google",
    description: "Campaigns, ad groups, keywords, budgets, and performance reporting.",
    authKind: "oauth",
    mcpPackage: "@anthropic/google-ads-mcp",
    credentials: [
      {
        key: "GOOGLE_ADS_CLIENT_ID",
        label: "OAuth Client ID",
        placeholder: "1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
        type: "text",
        helpUrl: "https://console.cloud.google.com/apis/credentials",
        helpText: "Create a Google OAuth client with Google Ads API access enabled.",
      },
      {
        key: "GOOGLE_ADS_CLIENT_SECRET",
        label: "OAuth Client Secret",
        placeholder: "GOCSPX-xxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        helpUrl: "https://console.cloud.google.com/apis/credentials",
        helpText: "Use the client secret from the same Google OAuth app.",
      },
      {
        key: "GOOGLE_ADS_REFRESH_TOKEN",
        label: "Refresh Token",
        placeholder: "1//0gxxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        helpText: "Generate an offline-access refresh token for the Google Ads account you want this agent to manage.",
      },
      {
        key: "GOOGLE_ADS_DEVELOPER_TOKEN",
        label: "Developer Token",
        placeholder: "insert-google-ads-developer-token",
        type: "password",
        helpText: "Use the Google Ads API developer token tied to your manager account.",
      },
    ],
  },
};

export function getToolDefinition(toolId: string): McpToolDefinition | null {
  return MCP_TOOL_REGISTRY[toolId] ?? null;
}

export function getToolCredentialFields(toolId: string): McpCredentialField[] {
  return getToolDefinition(toolId)?.credentials ?? [];
}

export function toolSupportsDirectConnection(toolId: string): boolean {
  return getToolDefinition(toolId) !== null;
}

export function toolRequiresCredentials(toolId: string): boolean {
  return getToolCredentialFields(toolId).length > 0;
}

export function areRequiredCredentialsFilled(
  toolId: string,
  credentials: Record<string, string>,
): boolean {
  return getToolCredentialFields(toolId).every(
    (field) => (credentials[field.key] ?? "").trim().length > 0,
  );
}

export function getToolRuntimeInputGuidance(
  toolId: string,
): ToolRuntimeInputGuidance | null {
  return TOOL_RUNTIME_INPUT_GUIDANCE[toolId] ?? null;
}

export function listSupportedTools(): SupportedToolContext[] {
  return Object.values(MCP_TOOL_REGISTRY).map((tool) => ({
    toolId: tool.id,
    name: tool.name,
    description: tool.description,
    connectorType: "mcp",
    mcpPackage: tool.mcpPackage,
  }));
}

export function buildSupportedToolsContext(): string {
  return listSupportedTools()
    .map(
      (tool) =>
        `- ${tool.name} (${tool.toolId}): ${tool.description}. Current direct connector: ${tool.connectorType.toUpperCase()} via ${tool.mcpPackage}.`,
    )
    .join("\n");
}

// ─── API helpers for credential management ────────────────────────────────────

export async function saveToolCredentials(
  agentId: string,
  toolId: string,
  credentials: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/credentials/${toolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Failed: ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function deleteToolCredentials(
  agentId: string,
  toolId: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/credentials/${toolId}`, {
      method: "DELETE",
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function fetchCredentialSummary(
  agentId: string,
): Promise<Array<{ toolId: string; hasCredentials: boolean; createdAt: string }>> {
  try {
    const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/credentials`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
