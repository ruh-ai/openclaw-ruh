import { describe, expect, test } from "bun:test";
import { resolveCreatePageChatMode, type ForgeAgentMode } from "../agent-mode";
import {
  normalizeCreateMode,
  CREATE_AGENT_MODE_OPTIONS,
  type CreateAgentMode,
} from "../create-mode";
import {
  createInitialCreateSessionConfig,
  applyAcceptedImprovementsToConfig,
  deriveCreateSessionReviewState,
  resolveConfiguredSkillNames,
  applyReviewOutputToCreateSessionConfig,
  projectSelectedSkillsRuntimeContract,
  type CreateSessionConfigState,
} from "../create-session-config";

// --- agent-mode.ts ---

describe("resolveCreatePageChatMode", () => {
  test("returns 'agent' for live mode", () => {
    expect(resolveCreatePageChatMode("live")).toBe("agent");
  });

  test("returns 'builder' for building mode", () => {
    expect(resolveCreatePageChatMode("building")).toBe("builder");
  });
});

// --- create-mode.ts ---

describe("normalizeCreateMode", () => {
  test("returns 'chat' for 'chat' input", () => {
    expect(normalizeCreateMode("chat")).toBe("chat");
  });

  test("returns 'copilot' for 'copilot' input", () => {
    expect(normalizeCreateMode("copilot")).toBe("copilot");
  });

  test("returns 'copilot' for null", () => {
    expect(normalizeCreateMode(null)).toBe("copilot");
  });

  test("returns 'copilot' for undefined", () => {
    expect(normalizeCreateMode(undefined)).toBe("copilot");
  });

  test("returns 'copilot' for any unrecognized string", () => {
    expect(normalizeCreateMode("wizard")).toBe("copilot");
    expect(normalizeCreateMode("")).toBe("copilot");
  });
});

describe("CREATE_AGENT_MODE_OPTIONS", () => {
  test("has copilot and chat modes", () => {
    expect(CREATE_AGENT_MODE_OPTIONS.length).toBe(2);
    const ids = CREATE_AGENT_MODE_OPTIONS.map((o) => o.id);
    expect(ids).toContain("copilot");
    expect(ids).toContain("chat");
  });
});

// --- create-session-config.ts ---

describe("createInitialCreateSessionConfig", () => {
  test("returns default config with no seed", () => {
    const config = createInitialCreateSessionConfig();
    expect(config.toolConnections).toEqual([]);
    expect(config.toolConnectionsTouched).toBe(false);
    expect(config.credentialDrafts).toEqual({});
    expect(config.runtimeInputs).toEqual([]);
    expect(config.runtimeInputsTouched).toBe(false);
    expect(config.selectedSkills).toEqual([]);
    expect(config.triggers).toEqual([]);
    expect(config.triggersTouched).toBe(false);
  });

  test("seeds selected skills from skill graph when skills array is empty", () => {
    const config = createInitialCreateSessionConfig({
      skills: [],
      skillGraph: [
        { skill_id: "s1", name: "Skill One", description: "", source: "custom", depends_on: [] },
        { skill_id: "s2", name: "Skill Two", description: "", source: "custom", depends_on: [] },
      ],
      agentRules: [],
      runtimeInputs: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    });
    expect(config.selectedSkills).toEqual(["s1", "s2"]);
  });

  test("seeds selected skills from saved skills array when provided", () => {
    const config = createInitialCreateSessionConfig({
      skills: ["data-analysis"],
      skillGraph: [
        { skill_id: "data-analysis", name: "Data Analysis", description: "", source: "custom", depends_on: [] },
      ],
      agentRules: [],
      runtimeInputs: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    });
    expect(config.selectedSkills).toContain("data-analysis");
  });
});

describe("applyAcceptedImprovementsToConfig", () => {
  test("returns unchanged tool connections when no improvements", () => {
    const result = applyAcceptedImprovementsToConfig({
      toolConnections: [
        {
          toolId: "github",
          name: "GitHub",
          description: "Git hosting",
          status: "configured",
          authKind: "api_key",
          connectorType: "mcp",
        },
      ],
      improvements: [],
    });
    expect(result.toolConnections).toHaveLength(1);
    expect(result.toolConnections[0].toolId).toBe("github");
  });

  test("adds a projected tool from accepted improvement", () => {
    const result = applyAcceptedImprovementsToConfig({
      toolConnections: [],
      improvements: [
        {
          id: "connect-google-ads",
          kind: "tool_connection",
          status: "accepted",
          title: "Connect Google Ads",
          summary: "Required for campaign management",
          targetId: "google-ads",
        },
      ],
    });
    expect(result.toolConnections.length).toBeGreaterThanOrEqual(1);
    const googleAds = result.toolConnections.find((c) => c.toolId === "google-ads");
    expect(googleAds).toBeDefined();
  });

  test("does not project dismissed improvements", () => {
    const result = applyAcceptedImprovementsToConfig({
      toolConnections: [],
      improvements: [
        {
          id: "some-tool",
          kind: "tool_connection",
          status: "dismissed",
          title: "Some Tool",
          summary: "Not needed",
          targetId: "some-tool",
        },
      ],
    });
    expect(result.toolConnections).toHaveLength(0);
  });
});

describe("resolveConfiguredSkillNames", () => {
  test("returns fallback when no selected skills", () => {
    const result = resolveConfiguredSkillNames([], null, ["fallback-skill"]);
    expect(result).toEqual(["fallback-skill"]);
  });

  test("returns skill names from graph", () => {
    const result = resolveConfiguredSkillNames(
      ["s1", "s2"],
      [
        { skill_id: "s1", name: "Campaign Audit", description: "", source: "custom", depends_on: [] },
        { skill_id: "s2", name: "Budget Pacing", description: "", source: "custom", depends_on: [] },
      ],
      [],
    );
    expect(result).toEqual(["Campaign Audit", "Budget Pacing"]);
  });

  test("returns skill IDs when no graph provided", () => {
    const result = resolveConfiguredSkillNames(["s1", "s2"], null, []);
    expect(result).toEqual(["s1", "s2"]);
  });
});

describe("deriveCreateSessionReviewState", () => {
  test("uses session triggers when touched", () => {
    const session: CreateSessionConfigState = {
      toolConnections: [],
      toolConnectionsTouched: false,
      credentialDrafts: {},
      runtimeInputs: [],
      runtimeInputsTouched: false,
      selectedSkills: [],
      triggers: [{ id: "t1", title: "Manual", kind: "manual", status: "supported", description: "" }],
      triggersTouched: true,
    };
    const result = deriveCreateSessionReviewState(session);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].id).toBe("t1");
  });

  test("uses fallback triggers when not touched", () => {
    const session: CreateSessionConfigState = {
      toolConnections: [],
      toolConnectionsTouched: false,
      credentialDrafts: {},
      runtimeInputs: [],
      runtimeInputsTouched: false,
      selectedSkills: [],
      triggers: [],
      triggersTouched: false,
    };
    const result = deriveCreateSessionReviewState(session, {
      runtimeInputs: [],
      toolConnections: [],
      triggers: [{ id: "fb1", title: "Cron", kind: "cron", status: "supported", description: "Daily" }],
    });
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].id).toBe("fb1");
  });
});

describe("projectSelectedSkillsRuntimeContract", () => {
  test("returns empty arrays when no skill graph", () => {
    const result = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: ["s1"],
      skillGraph: null,
      workflow: null,
    });
    expect(result.selectedSkillIds).toEqual(["s1"]);
    expect(result.runtimeInputs).toEqual([]);
  });

  test("filters skill graph to selected skills", () => {
    const result = projectSelectedSkillsRuntimeContract({
      selectedSkillIds: ["s1"],
      skillGraph: [
        { skill_id: "s1", name: "Skill 1", description: "", source: "custom", depends_on: ["s2"] },
        { skill_id: "s2", name: "Skill 2", description: "", source: "custom", depends_on: [] },
      ],
      workflow: null,
    });
    expect(result.skillGraph).toHaveLength(1);
    expect(result.skillGraph![0].skill_id).toBe("s1");
    // s2 removed from depends_on since it's not selected
    expect(result.skillGraph![0].depends_on).toEqual([]);
  });
});
