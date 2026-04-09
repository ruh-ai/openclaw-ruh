import type { AgentDevStage } from "./types";

interface FeatureContext {
  title: string;
  description: string;
  baselineAgent: { name: string; skillCount: number; skills: string[] };
}

interface BuildBuilderChatSuggestionsInput {
  devStage?: AgentDevStage;
  name: string;
  description: string;
  featureContext?: FeatureContext | null;
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
  featureContext,
}: BuildBuilderChatSuggestionsInput): string[] {
  // Feature mode: return feature-specific suggestions
  if (featureContext) {
    return buildFeatureSuggestions(devStage, featureContext);
  }

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

function buildFeatureSuggestions(devStage: AgentDevStage | undefined, ctx: FeatureContext): string[] {
  const agent = ctx.baselineAgent.name;
  const skills = ctx.baselineAgent.skills.join(", ") || "none yet";

  switch (devStage) {
    case "think":
      return [
        `I want to add a new feature to ${agent}: "${ctx.title}". ${ctx.description ? ctx.description + " " : ""}The agent currently has ${ctx.baselineAgent.skillCount} skills (${skills}). Design the feature requirements — what new skills, tools, and configuration are needed.`,
      ];
    case "plan":
    case "build":
      return [
        `What new skills and tools does ${agent} need for "${ctx.title}"?`,
        `How should "${ctx.title}" integrate with the existing ${ctx.baselineAgent.skillCount} skills?`,
      ];
    case "review":
    case "test":
      return [
        `Check if "${ctx.title}" works correctly with the existing skills`,
        `What could go wrong when "${ctx.title}" runs alongside the existing features?`,
      ];
    case "ship":
    case "reflect":
      return [
        `Summarize what "${ctx.title}" added to ${agent}`,
      ];
    default:
      return [
        `Add "${ctx.title}" to ${agent}: ${ctx.description || "Design the feature requirements."}`,
      ];
  }
}
