import { describe, expect, test } from "bun:test";
import { buildBuilderChatSuggestions } from "./builder-chat-suggestions";

describe("buildBuilderChatSuggestions", () => {
  test("returns generic starter ideas when no agent context exists", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "think",
      name: "",
      description: "",
    });

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].prompt).toContain("Google Ads");
  });

  test("returns agent-specific prompts once name and description are known", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "review",
      name: "Inventory Alert Bot",
      description: "Monitors Shopify inventory every hour, ranks low-stock items, and posts Slack alerts.",
    });

    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((suggestion) =>
      suggestion.prompt.includes("Inventory Alert Bot")
      || /inventory|shopify|slack/i.test(suggestion.prompt),
    )).toBe(true);
    expect(suggestions.map((suggestion) => suggestion.prompt).join(" ")).not.toMatch(/Zendesk|Instagram|Twitter/i);
  });

  test("returns PRD revision suggestions when Think PRD is selected", () => {
    const suggestions = buildBuilderChatSuggestions({
      stageContext: {
        stage: "think",
        mode: "revise",
        readiness: "draft",
        primaryArtifact: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
        allowedActions: ["ask", "request_changes", "approve", "compare"],
      },
      agentName: "Google Ads Agent",
    });

    expect(suggestions).toEqual([
      expect.objectContaining({ label: "Revise PRD" }),
      expect.objectContaining({ label: "Add Missing Edge Cases" }),
      expect.objectContaining({ label: "Approve PRD" }),
    ]);
  });

  test("returns build-debug suggestions when build report is blocked", () => {
    const suggestions = buildBuilderChatSuggestions({
      stageContext: {
        stage: "build",
        mode: "debug",
        readiness: "blocked",
        primaryArtifact: { kind: "build_report", path: ".openclaw/build/build-report.json" },
        allowedActions: ["ask", "debug", "retry_build"],
      },
      agentName: "Builder Lifecycle Sentinel",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toContain("Explain Build Failure");
    expect(suggestions.map((suggestion) => suggestion.label)).toContain("Retry Failed Step");
  });

  test("does not suggest shipping until stage context allows ship", () => {
    const suggestions = buildBuilderChatSuggestions({
      stageContext: {
        stage: "ship",
        mode: "ask",
        readiness: "draft",
        primaryArtifact: null,
        allowedActions: ["ask"],
      },
      agentName: "Builder Lifecycle Sentinel",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).not.toContain("Ship Agent");
    expect(suggestions.map((suggestion) => suggestion.label)).toContain("Check Ship Readiness");
  });
});
