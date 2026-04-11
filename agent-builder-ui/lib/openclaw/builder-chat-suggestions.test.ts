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
    expect(suggestions[0]).toContain("Google Ads");
  });

  test("returns agent-specific prompts once name and description are known", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "review",
      name: "Inventory Alert Bot",
      description: "Monitors Shopify inventory every hour, ranks low-stock items, and posts Slack alerts.",
    });

    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((suggestion) =>
      suggestion.includes("Inventory Alert Bot")
      || /inventory|shopify|slack/i.test(suggestion),
    )).toBe(true);
    expect(suggestions.join(" ")).not.toMatch(/Zendesk|Instagram|Twitter/i);
  });

  test("returns generic suggestions when name is empty but description is set", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "think",
      name: "",
      description: "Monitors Google Ads campaigns",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toContain("Google Ads");
  });

  test("returns plan/build suggestions for plan stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "plan",
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some(s => s.includes("architecture") || s.includes("Design"))).toBe(true);
  });

  test("returns plan/build suggestions for build stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "build",
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
  });

  test("returns think suggestions when devStage is undefined", () => {
    const suggestions = buildBuilderChatSuggestions({
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some(s => s.includes("PRD") || s.includes("TRD") || s.includes("functionality"))).toBe(true);
  });

  test("returns test suggestions for ship stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "ship",
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some(s => s.includes("Refine") || s.includes("Review") || s.includes("Tighten"))).toBe(true);
  });

  test("returns test suggestions for reflect stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "reflect",
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
  });

  test("returns test suggestions for test stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "test",
      name: "Ad Optimizer",
      description: "Optimizes Google Ads campaigns daily",
    });
    expect(suggestions).toHaveLength(3);
  });
});

describe("buildBuilderChatSuggestions — featureContext", () => {
  const featureCtx = {
    title: "Budget Alert Feature",
    description: "Alert when campaigns exceed budget",
    baselineAgent: { name: "Google Ads Agent", skillCount: 3, skills: ["campaign-monitor", "ad-optimizer", "budget-manager"] },
  };

  test("returns feature think suggestions for think stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "think",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain("Budget Alert Feature");
    expect(suggestions[0]).toContain("Google Ads Agent");
  });

  test("returns feature plan/build suggestions for plan stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "plan",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toContain("Budget Alert Feature");
  });

  test("returns feature plan/build suggestions for build stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "build",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(2);
  });

  test("returns feature review/test suggestions for review stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "review",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toContain("Budget Alert Feature");
  });

  test("returns feature review/test suggestions for test stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "test",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(2);
  });

  test("returns feature ship/reflect summary for ship stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "ship",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain("Summarize");
  });

  test("returns feature ship/reflect summary for reflect stage", () => {
    const suggestions = buildBuilderChatSuggestions({
      devStage: "reflect",
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(1);
  });

  test("returns default feature suggestion when devStage is undefined", () => {
    const suggestions = buildBuilderChatSuggestions({
      name: "Google Ads Agent",
      description: "Manages ads",
      featureContext: featureCtx,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain("Budget Alert Feature");
  });
});
