/**
 * Channel Catalog — defines available communication channels and their
 * current support status on the platform.
 *
 * Channels are "intent-only" during agent creation: the user declares which
 * channels the agent should be accessible through without entering credentials.
 * Actual channel connection happens post-deploy in the agent setup flow.
 */

import type { AgentChannelKind, AgentChannelSelection, AgentChannelStatus } from "@/lib/agents/types";

export interface ChannelCatalogEntry {
  kind: AgentChannelKind;
  label: string;
  description: string;
  icon: string;
  status: AgentChannelStatus;
  availabilityLabel: string;
  /** Environment variables required to connect this channel. */
  requiredEnv: string[];
}

const CHANNEL_CATALOG: ChannelCatalogEntry[] = [
  {
    kind: "telegram",
    label: "Telegram",
    description: "Agent runs as a Telegram bot. Users interact through direct messages or group chats.",
    icon: "message-circle",
    status: "planned",
    availabilityLabel: "Supported — configure after deploy",
    requiredEnv: ["TELEGRAM_BOT_TOKEN"],
  },
  {
    kind: "slack",
    label: "Slack",
    description: "Agent runs as a Slack bot. Users interact through channels, threads, or direct messages.",
    icon: "hash",
    status: "planned",
    availabilityLabel: "Supported — configure after deploy",
    requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
  },
  {
    kind: "discord",
    label: "Discord",
    description: "Agent runs as a Discord bot. Users interact through server channels or direct messages.",
    icon: "headphones",
    status: "unsupported",
    availabilityLabel: "Planned — not yet available",
    requiredEnv: ["DISCORD_BOT_TOKEN"],
  },
];

export function getChannelCatalog(): ChannelCatalogEntry[] {
  return CHANNEL_CATALOG;
}

export function getChannelEntry(kind: AgentChannelKind): ChannelCatalogEntry | null {
  return CHANNEL_CATALOG.find((entry) => entry.kind === kind) ?? null;
}

/**
 * Detect which channels should be pre-selected based on discovery answers.
 */
export function detectSuggestedChannels(
  discoveryAnswers: Record<string, string | string[]>,
): AgentChannelKind[] {
  const channelAnswer = discoveryAnswers["channels"];
  if (!channelAnswer) return [];

  if (Array.isArray(channelAnswer)) {
    return channelAnswer.filter(isChannelKind);
  }

  if (isChannelKind(channelAnswer)) {
    return [channelAnswer];
  }

  // Keyword-based fallback for text answers
  const text = channelAnswer.toLowerCase();
  const detected: AgentChannelKind[] = [];
  if (text.includes("telegram")) detected.push("telegram");
  if (text.includes("slack")) detected.push("slack");
  if (text.includes("discord")) detected.push("discord");
  return detected;
}

function isChannelKind(value: string): value is AgentChannelKind {
  return value === "telegram" || value === "slack" || value === "discord";
}

/**
 * Build channel selections from selected kinds for the copilot store.
 */
export function buildChannelSelections(
  selectedKinds: Set<AgentChannelKind>,
): AgentChannelSelection[] {
  return CHANNEL_CATALOG
    .filter((entry) => selectedKinds.has(entry.kind))
    .map((entry) => ({
      kind: entry.kind,
      status: entry.status,
      label: entry.label,
      description: entry.description,
    }));
}
