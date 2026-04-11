import { describe, expect, test } from "bun:test";
import {
  getChannelCatalog,
  getChannelEntry,
  detectSuggestedChannels,
  buildChannelSelections,
} from "./channel-catalog";

describe("getChannelCatalog", () => {
  test("returns array of channel entries", () => {
    const catalog = getChannelCatalog();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  test("each entry has required fields", () => {
    const catalog = getChannelCatalog();
    for (const entry of catalog) {
      expect(typeof entry.kind).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(typeof entry.icon).toBe("string");
      expect(typeof entry.status).toBe("string");
      expect(typeof entry.availabilityLabel).toBe("string");
      expect(Array.isArray(entry.requiredEnv)).toBe(true);
    }
  });

  test("includes telegram, slack, and discord entries", () => {
    const catalog = getChannelCatalog();
    const kinds = catalog.map((e) => e.kind);
    expect(kinds).toContain("telegram");
    expect(kinds).toContain("slack");
    expect(kinds).toContain("discord");
  });
});

describe("getChannelEntry", () => {
  test("returns telegram entry", () => {
    const entry = getChannelEntry("telegram");
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("telegram");
    expect(entry!.label).toBe("Telegram");
    expect(entry!.requiredEnv).toContain("TELEGRAM_BOT_TOKEN");
  });

  test("returns slack entry", () => {
    const entry = getChannelEntry("slack");
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("slack");
    expect(entry!.requiredEnv).toContain("SLACK_BOT_TOKEN");
  });

  test("returns discord entry", () => {
    const entry = getChannelEntry("discord");
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("discord");
  });
});

describe("detectSuggestedChannels", () => {
  test("returns empty array when no channels answer", () => {
    const result = detectSuggestedChannels({});
    expect(result).toEqual([]);
  });

  test("returns channels from array answer", () => {
    const result = detectSuggestedChannels({ channels: ["telegram", "slack"] });
    expect(result).toEqual(["telegram", "slack"]);
  });

  test("filters out non-channel values in array", () => {
    const result = detectSuggestedChannels({ channels: ["telegram", "email", "slack"] });
    expect(result).toEqual(["telegram", "slack"]);
  });

  test("returns single channel kind when string is a valid kind", () => {
    const result = detectSuggestedChannels({ channels: "telegram" });
    expect(result).toEqual(["telegram"]);
  });

  test("detects channels from text using keywords", () => {
    const result = detectSuggestedChannels({
      channels: "I want it on Telegram and also Slack",
    });
    expect(result).toContain("telegram");
    expect(result).toContain("slack");
    expect(result).not.toContain("discord");
  });

  test("detects discord keyword in text", () => {
    const result = detectSuggestedChannels({
      channels: "Connect to discord and telegram",
    });
    expect(result).toContain("discord");
    expect(result).toContain("telegram");
  });

  test("returns empty array for text without channel keywords", () => {
    const result = detectSuggestedChannels({
      channels: "I want email notifications and SMS alerts",
    });
    expect(result).toEqual([]);
  });

  test("handles invalid string value that is not a channel kind", () => {
    const result = detectSuggestedChannels({ channels: "email" });
    expect(result).toEqual([]);
  });
});

describe("buildChannelSelections", () => {
  test("returns selections for telegram and slack", () => {
    const selections = buildChannelSelections(new Set(["telegram", "slack"]));
    expect(selections).toHaveLength(2);
    const kinds = selections.map((s) => s.kind);
    expect(kinds).toContain("telegram");
    expect(kinds).toContain("slack");
  });

  test("returns empty array for empty set", () => {
    const selections = buildChannelSelections(new Set());
    expect(selections).toEqual([]);
  });

  test("each selection has correct shape", () => {
    const selections = buildChannelSelections(new Set(["telegram"]));
    expect(selections[0].kind).toBe("telegram");
    expect(selections[0].label).toBe("Telegram");
    expect(typeof selections[0].status).toBe("string");
    expect(typeof selections[0].description).toBe("string");
  });

  test("ignores kinds not in catalog", () => {
    // TypeScript would prevent this but test runtime safety
    const selections = buildChannelSelections(new Set(["telegram", "unknown-kind" as any]));
    expect(selections).toHaveLength(1);
    expect(selections[0].kind).toBe("telegram");
  });
});
