import { getToolDefinition } from "@/app/(platform)/agents/create/_config/mcp-tool-registry";
import type { ArchitectResponse, SkillGraphNode } from "./types";

const TOOL_KEYWORD_MAP: Record<string, string> = {
  "google ads": "google-ads",
  "google workspace": "google",
  google_ads: "google-ads",
  googleads: "google-ads",
  slack: "slack",
  github: "github",
  jira: "jira",
  notion: "notion",
  linear: "linear",
  google_workspace: "google",
  googleworkspace: "google",
  zoho: "zoho-crm",
  analytics: "google-analytics",
  sheets: "google",
  gmail: "google",
  calendar: "google",
  docs: "google",
  drive: "google",
};

const WEBHOOK_KEYWORDS = [
  "webhook",
  "web hook",
  "http post",
  "post request",
  "incoming request",
  "callback url",
  "callback",
];

function normalizeToolHintId(toolId: string): string {
  const trimmed = toolId.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const directTool = getToolDefinition(trimmed);
  if (directTool) {
    return directTool.id;
  }

  if (trimmed === "google_ads") {
    return "google-ads";
  }

  for (const [keyword, mappedToolId] of Object.entries(TOOL_KEYWORD_MAP)) {
    if (trimmed.includes(keyword)) {
      return normalizeToolHintId(mappedToolId);
    }
  }

  return trimmed;
}

function collectExplicitToolHintIds(response: ArchitectResponse | undefined): string[] {
  if (!response?.tool_connections?.length) {
    return [];
  }

  return response.tool_connections
    .map((connection) => normalizeToolHintId(connection.tool_id ?? ""))
    .filter(Boolean);
}

export function detectToolHintIds(
  nodes: SkillGraphNode[],
  response?: ArchitectResponse,
): string[] {
  const toolIds = new Set<string>();

  for (const toolId of collectExplicitToolHintIds(response)) {
    toolIds.add(toolId);
  }

  for (const node of nodes) {
    const text = `${node.skill_id} ${node.name} ${node.description ?? ""} ${node.external_api ?? ""}`.toLowerCase();

    for (const [keyword, toolId] of Object.entries(TOOL_KEYWORD_MAP)) {
      if (text.includes(keyword)) {
        const normalized = normalizeToolHintId(toolId);
        if (normalized) {
          toolIds.add(normalized);
        }
      }
    }

    if (!node.native_tool) {
      continue;
    }

    const nativeToolText = node.native_tool.toLowerCase();
    for (const [keyword, toolId] of Object.entries(TOOL_KEYWORD_MAP)) {
      if (nativeToolText.includes(keyword)) {
        const normalized = normalizeToolHintId(toolId);
        if (normalized) {
          toolIds.add(normalized);
        }
      }
    }
  }

  return [...toolIds];
}

function collectTriggerIntentText(response: ArchitectResponse): string {
  const meta = response.agent_metadata;
  const reqs = response.requirements;
  const dataSourceText = (reqs?.data_sources ?? [])
    .map((source) => `${source.source_type} ${source.access_method} ${source.skill_id ?? ""}`)
    .join(" ");
  const outputsText = (reqs?.outputs ?? [])
    .map((output) => `${output.type} ${output.format ?? ""}`)
    .join(" ");

  return [
    response.content,
    response.description,
    meta?.schedule_description,
    meta?.cron_expression,
    reqs?.description,
    reqs?.schedule,
    dataSourceText,
    outputsText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const CHANNEL_KEYWORD_MAP: Record<string, string> = {
  telegram: "telegram",
  slack: "slack",
  discord: "discord",
};

export function detectChannelHintIds(
  nodes: SkillGraphNode[],
  response: ArchitectResponse,
): string[] {
  const channelIds = new Set<string>();

  // Check skill graph nodes for channel keywords
  for (const node of nodes) {
    const text =
      `${node.skill_id} ${node.name} ${node.description ?? ""} ${node.external_api ?? ""}`.toLowerCase();

    for (const [keyword, channelId] of Object.entries(CHANNEL_KEYWORD_MAP)) {
      if (text.includes(keyword)) {
        channelIds.add(channelId);
      }
    }
  }

  // Check architect response content and metadata for channel keywords
  const responseText = [
    response.content,
    response.description,
    response.agent_metadata?.primary_users,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [keyword, channelId] of Object.entries(CHANNEL_KEYWORD_MAP)) {
    if (responseText.includes(keyword)) {
      channelIds.add(channelId);
    }
  }

  return [...channelIds];
}

export function detectTriggerHintIds(response: ArchitectResponse): string[] {
  const ids = new Set<string>();
  const meta = response.agent_metadata;
  const reqs = response.requirements;

  for (const trigger of response.triggers ?? []) {
    const kind = trigger.kind?.trim().toLowerCase();
    const triggerId = trigger.id?.trim().toLowerCase() ?? "";
    const title = trigger.title?.trim().toLowerCase() ?? "";

    if (
      kind === "schedule" ||
      triggerId.includes("schedule") ||
      triggerId.includes("cron") ||
      title.includes("schedule")
    ) {
      ids.add("cron-schedule");
    }

    if (
      kind === "webhook" ||
      triggerId.includes("webhook") ||
      title.includes("webhook")
    ) {
      ids.add("webhook-post");
    }
  }

  if ((response.cron_jobs ?? []).length > 0) {
    ids.add("cron-schedule");
  }

  if (meta?.cron_expression || meta?.schedule_description || reqs?.schedule) {
    ids.add("cron-schedule");
  }

  const triggerIntentText = collectTriggerIntentText(response);
  if (WEBHOOK_KEYWORDS.some((keyword) => triggerIntentText.includes(keyword))) {
    ids.add("webhook-post");
  }

  return [...ids];
}
