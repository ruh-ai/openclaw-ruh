export interface IntermediateUpdate {
  kind: "identity" | "skill_discovered" | "tool_hint" | "trigger_hint" | "channel_hint";
  [key: string]: unknown;
}

const TOOL_KEYWORDS: Record<string, string> = {
  shopify: "shopify",
  "google ads": "google-ads",
  google_ads: "google-ads",
  slack: "slack",
  github: "github",
  jira: "jira",
  notion: "notion",
  stripe: "stripe",
  twilio: "twilio",
  sendgrid: "sendgrid",
  hubspot: "hubspot",
  salesforce: "salesforce",
  zendesk: "zendesk",
};

const TRIGGER_KEYWORDS = ["cron", "schedule", "scheduled", "webhook", "http post", "polling"];

const CHANNEL_KEYWORDS: Record<string, string> = {
  telegram: "telegram",
  slack: "slack",
  discord: "discord",
};

/**
 * Incrementally scan accumulated stream content for structured updates that can
 * progressively advance the builder before the terminal review payload lands.
 *
 * Phase order is intentionally gated:
 * identity -> skills -> tools -> triggers -> channels
 */
export function extractIntermediateUpdates(
  fullContent: string,
  emitted: Set<string>,
): IntermediateUpdate[] {
  const updates: IntermediateUpdate[] = [];
  const lower = fullContent.toLowerCase();

  if (!emitted.has("identity")) {
    const namePatterns = [
      /(?:agent|template)\s+(?:named|called)\s+["']?([A-Z][A-Za-z0-9 -]{2,30})/,
      /(?:I'll|I will)\s+(?:build|create)\s+(?:a\s+|an\s+|the\s+)?(?:production-ready\s+)?["']?([A-Z][A-Za-z0-9 -]{2,30}?)(?=\s+(?:agent|for|that|which|to)\b|[.",\n]|$)/,
      /system_name["':\s]+["']?([a-z][a-z0-9-]+)/,
      /(?:scoped|designed|planned)\s+the\s+agent\s+(?:around|as|for|to)\s+(.{5,60}?)(?:\.|,|;|\n)/i,
      /# You are ([A-Z][A-Za-z0-9 -]{2,40})/,
      /\*\*([A-Z][A-Za-z0-9 -]{2,30} (?:Agent|Bot))\*\*/,
    ];

    for (const pattern of namePatterns) {
      const match = fullContent.match(pattern);
      if (!match) continue;

      const rawName = match[1].trim().replace(/["']+$/, "");
      const name = rawName.includes("-")
        ? rawName
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
        : rawName;
      const descMatch = fullContent.match(
        new RegExp(`${rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.\\s]*([^.]{10,120})\\.`, "i"),
      );

      updates.push({
        kind: "identity",
        name,
        description: descMatch?.[1]?.trim() || "",
      });
      emitted.add("identity");
      break;
    }

    return updates;
  }

  const skillPathRegex = /skills\/([a-z][a-z0-9-]+)\.md/g;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillPathRegex.exec(lower)) !== null) {
    const skillId = skillMatch[1];
    const key = `skill:${skillId}`;
    if (emitted.has(key)) continue;

    const nameFromYaml = fullContent.match(
      new RegExp(`${skillId}\\.md[\\s\\S]{0,200}name:\\s*["']?([^"'\\n]+)`, "i"),
    );
    const skillName =
      nameFromYaml?.[1]?.trim() ||
      skillId
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

    updates.push({
      kind: "skill_discovered",
      skillId,
      name: skillName,
      description: "",
    });
    emitted.add(key);
  }

  const hasSkills = Array.from(emitted).some((key) => key.startsWith("skill:"));
  if (!hasSkills) {
    return updates;
  }

  for (const [keyword, toolId] of Object.entries(TOOL_KEYWORDS)) {
    const key = `tool:${toolId}`;
    if (emitted.has(key) || !lower.includes(keyword)) continue;
    updates.push({ kind: "tool_hint", toolId });
    emitted.add(key);
  }

  const hasTools = Array.from(emitted).some((key) => key.startsWith("tool:"));
  if (!hasTools) {
    return updates;
  }

  for (const keyword of TRIGGER_KEYWORDS) {
    const triggerId =
      keyword === "webhook" || keyword === "http post" ? "webhook-post" : "cron-schedule";
    const key = `trigger:${triggerId}`;
    if (emitted.has(key) || !lower.includes(keyword)) continue;
    updates.push({ kind: "trigger_hint", triggerId });
    emitted.add(key);
  }

  const hasTriggers = Array.from(emitted).some((key) => key.startsWith("trigger:"));
  if (!hasTriggers) {
    return updates;
  }

  for (const [keyword, channelId] of Object.entries(CHANNEL_KEYWORDS)) {
    const key = `channel:${channelId}`;
    if (emitted.has(key) || !lower.includes(keyword)) continue;
    updates.push({ kind: "channel_hint", channelId });
    emitted.add(key);
  }

  return updates;
}
