import { describe, expect, test } from "bun:test";

import {
  normalizeSkillLookup,
  resolveSkillAvailability,
  type SkillRegistryEntry,
} from "./skill-registry";

const REGISTRY: SkillRegistryEntry[] = [
  {
    skill_id: "slack-reader",
    name: "Slack Reader",
    description: "Read Slack threads.",
    tags: ["slack"],
    skill_md: "# Slack Reader",
  },
];

describe("normalizeSkillLookup", () => {
  test("normalizes underscores, spacing, and case", () => {
    expect(normalizeSkillLookup("  Slack_Reader  ")).toBe("slack-reader");
  });
});

describe("resolveSkillAvailability", () => {
  test("marks native-tool nodes as native", () => {
    const result = resolveSkillAvailability(
      [
        {
          skill_id: "chat",
          name: "Chat",
          source: "native_tool",
          status: "always_included",
          depends_on: [],
          native_tool: "chat",
        },
      ],
      REGISTRY,
    );

    expect(result).toEqual([
      {
        skillId: "chat",
        status: "native",
        reason: "This skill maps to a native agent capability and does not require a registry entry.",
      },
    ]);
  });

  test("matches registry skills by normalized id", () => {
    const result = resolveSkillAvailability(
      [
        {
          skill_id: "slack_reader",
          name: "Slack Reader",
          source: "existing",
          status: "found",
          depends_on: [],
        },
      ],
      REGISTRY,
    );

    expect(result).toEqual([
      {
        skillId: "slack_reader",
        status: "registry_match",
        matchedSkillId: "slack-reader",
        reason: "Matched registry skill Slack Reader.",
      },
    ]);
  });

  test("marks unmatched skills as needs_build", () => {
    const result = resolveSkillAvailability(
      [
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          source: "custom",
          status: "generated",
          depends_on: [],
        },
      ],
      REGISTRY,
    );

    expect(result).toEqual([
      {
        skillId: "budget-pacing-report",
        status: "needs_build",
        reason: "No matching skill exists in the registry yet. Build this skill before deploy.",
      },
    ]);
  });

  test("promotes built skills to custom_built", () => {
    const result = resolveSkillAvailability(
      [
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          source: "custom",
          status: "generated",
          depends_on: [],
        },
      ],
      REGISTRY,
      ["budget-pacing-report"],
    );

    expect(result).toEqual([
      {
        skillId: "budget-pacing-report",
        status: "custom_built",
        reason: "A custom SKILL.md has been prepared for this capability.",
      },
    ]);
  });
});
