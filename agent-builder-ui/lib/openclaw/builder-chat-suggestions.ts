import type { AgentDevStage } from "./types";

interface BuildBuilderChatSuggestionsInput {
  devStage?: AgentDevStage;
  name: string;
  description: string;
}

const GENERIC_STARTER_SUGGESTIONS = [
  "A Google Ads agent that monitors campaign performance daily, detects underperforming ads, and sends optimization recommendations to Slack",
  "A customer support bot that triages Zendesk tickets, searches the knowledge base, drafts responses, and escalates urgent issues to Telegram",
  "A social media scheduler that pulls content from Notion, generates captions, and posts to Instagram and Twitter on a weekly schedule",
];

export function buildBuilderChatSuggestions({
  devStage,
  name,
  description,
}: BuildBuilderChatSuggestionsInput): string[] {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  if (!trimmedName || !trimmedDescription) {
    return GENERIC_STARTER_SUGGESTIONS;
  }

  const mission = trimmedDescription.replace(/\s+/g, " ").trim();
  switch (devStage) {
    case "review":
    case "test":
    case "ship":
    case "reflect":
      return [
        `Refine ${trimmedName} without changing its mission: ${mission}`,
        `Review ${trimmedName}'s tools, triggers, and runtime inputs against this goal: ${mission}`,
        `Tighten ${trimmedName}'s SOUL, heartbeat, and deployment rules for this use case: ${mission}`,
      ];
    case "plan":
    case "build":
      return [
        `Design the architecture and workflow for ${trimmedName}: ${mission}`,
        `Recommend the exact skills, tools, and triggers ${trimmedName} needs for: ${mission}`,
        `Summarize how ${trimmedName} should operate, what it should connect to, and how often it should run: ${mission}`,
      ];
    case "think":
    default:
      return [
        `Create the PRD and TRD for ${trimmedName} based on this mission: ${mission}`,
        `What should ${trimmedName} actually do day to day if its purpose is: ${mission}`,
        `Suggest the core functionality, channels, and integrations for ${trimmedName}: ${mission}`,
      ];
  }
}
