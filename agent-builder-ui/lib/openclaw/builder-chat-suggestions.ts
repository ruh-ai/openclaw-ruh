import type { AgentDevStage } from "./types";
import type { ChatMode, StageContext } from "./stage-context";

interface FeatureContext {
  title: string;
  description: string;
  baselineAgent: { name: string; skillCount: number; skills: string[] };
}

export interface BuilderChatSuggestion {
  label: string;
  prompt: string;
  mode?: ChatMode;
}

interface LegacyBuilderChatSuggestionsInput {
  devStage?: AgentDevStage;
  name: string;
  description: string;
  featureContext?: FeatureContext | null;
}

interface StageAwareBuilderChatSuggestionsInput {
  stageContext: StageContext;
  agentName: string;
  featureContext?: FeatureContext | null;
}

type BuildBuilderChatSuggestionsInput =
  | LegacyBuilderChatSuggestionsInput
  | StageAwareBuilderChatSuggestionsInput;

const GENERIC_STARTER_SUGGESTIONS = [
  "A Google Ads agent that monitors campaign performance daily, detects underperforming ads, and sends optimization recommendations to Slack",
  "A customer support bot that triages Zendesk tickets, searches the knowledge base, drafts responses, and escalates urgent issues to Telegram",
  "A social media scheduler that pulls content from Notion, generates captions, and posts to Instagram and Twitter on a weekly schedule",
];

function suggestion(label: string, prompt: string, mode: ChatMode = "ask"): BuilderChatSuggestion {
  return { label, prompt, mode };
}

function isStageAwareInput(
  input: BuildBuilderChatSuggestionsInput,
): input is StageAwareBuilderChatSuggestionsInput {
  return "stageContext" in input;
}

export function buildBuilderChatSuggestions(input: BuildBuilderChatSuggestionsInput): BuilderChatSuggestion[] {
  if (isStageAwareInput(input)) {
    return buildStageAwareSuggestions(input);
  }

  const { devStage, name, description, featureContext } = input;
  // Feature mode: return feature-specific suggestions
  if (featureContext) {
    return buildFeatureSuggestions(devStage, featureContext);
  }

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  if (!trimmedName || !trimmedDescription) {
    return GENERIC_STARTER_SUGGESTIONS.map((prompt, index) =>
      suggestion(["Google Ads Optimizer", "Support Triage Bot", "Social Scheduler"][index] ?? "Example Agent", prompt),
    );
  }

  const mission = trimmedDescription.replace(/\s+/g, " ").trim();
  switch (devStage) {
    case "review":
    case "test":
    case "ship":
    case "reflect":
      return [
        suggestion("Refine Mission", `Refine ${trimmedName} without changing its mission: ${mission}`, "revise"),
        suggestion("Review Configuration", `Review ${trimmedName}'s tools, triggers, and runtime inputs against this goal: ${mission}`),
        suggestion("Tighten SOUL", `Tighten ${trimmedName}'s SOUL, heartbeat, and deployment rules for this use case: ${mission}`, "revise"),
      ];
    case "plan":
    case "build":
      return [
        suggestion("Design Architecture", `Design the architecture and workflow for ${trimmedName}: ${mission}`),
        suggestion("Recommend Skills", `Recommend the exact skills, tools, and triggers ${trimmedName} needs for: ${mission}`),
        suggestion("Summarize Operations", `Summarize how ${trimmedName} should operate, what it should connect to, and how often it should run: ${mission}`),
      ];
    case "think":
    default:
      return [
        suggestion("Create PRD/TRD", `Create the PRD and TRD for ${trimmedName} based on this mission: ${mission}`),
        suggestion("Clarify Daily Work", `What should ${trimmedName} actually do day to day if its purpose is: ${mission}`),
        suggestion("Suggest Capabilities", `Suggest the core functionality, channels, and integrations for ${trimmedName}: ${mission}`),
      ];
  }
}

function buildStageAwareSuggestions({
  stageContext,
  agentName,
  featureContext,
}: StageAwareBuilderChatSuggestionsInput): BuilderChatSuggestion[] {
  if (featureContext) {
    return buildFeatureSuggestions(stageContext.stage, featureContext);
  }

  const kind = stageContext.primaryArtifact?.kind;

  if (stageContext.stage === "think" && kind === "prd") {
    return [
      suggestion("Revise PRD", "Revise the PRD based on this feedback: ", "revise"),
      suggestion("Add Missing Edge Cases", "Add missing edge cases and failure scenarios to the PRD.", "revise"),
      suggestion("Approve PRD", "Approve the PRD and continue to the next Think artifact.", "approve"),
    ];
  }

  if (stageContext.stage === "think" && kind === "trd") {
    return [
      suggestion("Revise TRD", "Revise the TRD based on this feedback: ", "revise"),
      suggestion("Check Integrations", "Check the TRD for missing integration, auth, and data-flow details.", "revise"),
      suggestion("Approve TRD", "Approve the TRD and continue to Plan.", "approve"),
    ];
  }

  if (stageContext.stage === "plan" && kind === "plan") {
    return [
      suggestion("Split Skill", "Split the selected skill into smaller focused skills.", "revise"),
      suggestion("Remove Integration", "Remove unnecessary external integrations from the plan.", "revise"),
      suggestion("Approve Plan", "Approve this plan and start Build.", "approve"),
    ];
  }

  if (stageContext.stage === "build" && stageContext.readiness === "blocked") {
    return [
      suggestion("Explain Build Failure", "Explain the build failure using the build report and logs.", "debug"),
      suggestion("Retry Failed Step", "Retry only the failed build/setup step.", "debug"),
      suggestion("Patch Generated Files", "Patch the generated files needed to make Build pass.", "debug"),
    ];
  }

  if (stageContext.stage === "test") {
    return [
      suggestion("Run Test", `Run the next validation scenario for ${agentName}.`, "debug"),
      suggestion("Explain Test Coverage", "Explain which user flows are covered and which are still missing."),
      suggestion("Revise Test Cases", "Revise the test cases to cover edge cases before shipping.", "revise"),
    ];
  }

  if (stageContext.stage === "ship") {
    const suggestions = [
      suggestion("Review Ship Effects", "Summarize exactly what will be pushed, published, and activated before I confirm Ship."),
      suggestion("Prepare Ship Notes", `Draft concise release notes for ${agentName}.`),
    ];
    if (stageContext.allowedActions.includes("ship")) {
      suggestions.push(suggestion("Ship Agent", "Ship this agent after explicit confirmation.", "approve"));
    } else {
      suggestions.push(suggestion("Check Ship Readiness", "Check what is still required before this agent can be shipped."));
    }
    return suggestions;
  }

  return [
    suggestion(`Ask about ${agentName}`, `Explain the current ${stageContext.stage} state.`),
  ];
}

function buildFeatureSuggestions(devStage: AgentDevStage | undefined, ctx: FeatureContext): BuilderChatSuggestion[] {
  const agent = ctx.baselineAgent.name;
  const skills = ctx.baselineAgent.skills.join(", ") || "none yet";

  switch (devStage) {
    case "think":
      return [
        suggestion("Design Feature", `I want to add a new feature to ${agent}: "${ctx.title}". ${ctx.description ? ctx.description + " " : ""}The agent currently has ${ctx.baselineAgent.skillCount} skills (${skills}). Design the feature requirements: what new skills, tools, and configuration are needed.`),
      ];
    case "plan":
    case "build":
      return [
        suggestion("Plan New Skills", `What new skills and tools does ${agent} need for "${ctx.title}"?`),
        suggestion("Integrate Feature", `How should "${ctx.title}" integrate with the existing ${ctx.baselineAgent.skillCount} skills?`),
      ];
    case "review":
    case "test":
      return [
        suggestion("Check Feature", `Check if "${ctx.title}" works correctly with the existing skills`),
        suggestion("Find Risks", `What could go wrong when "${ctx.title}" runs alongside the existing features?`),
      ];
    case "ship":
    case "reflect":
      return [
        suggestion("Summarize Feature", `Summarize what "${ctx.title}" added to ${agent}`),
      ];
    default:
      return [
        suggestion("Add Feature", `Add "${ctx.title}" to ${agent}: ${ctx.description || "Design the feature requirements."}`),
      ];
  }
}
