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
});
