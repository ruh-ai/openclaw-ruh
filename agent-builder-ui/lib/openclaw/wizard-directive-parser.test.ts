import { describe, test as it, expect } from "bun:test";
import { parseWizardDirectives, buildWizardStateContext } from "./wizard-directive-parser";
import type { ArchitectResponse } from "./types";

describe("parseWizardDirectives", () => {
  it("extracts name from agent_metadata", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      agent_metadata: { agent_name: "Google Ads Manager" },
      skill_graph: {
        nodes: [
          { skill_id: "campaign_monitor", name: "Campaign Monitor", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const fieldUpdate = directives.find(d => d.type === "update_fields");
    expect(fieldUpdate).toBeDefined();
    if (fieldUpdate?.type === "update_fields") {
      expect(fieldUpdate.name).toBe("Google Ads Manager");
    }
  });

  it("extracts skills from skill_graph", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "ads_optimizer", name: "Ads Optimizer", source: "custom", status: "found", depends_on: [] },
          { skill_id: "report_gen", name: "Report Generator", source: "custom", status: "found", depends_on: ["ads_optimizer"] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const skills = directives.find(d => d.type === "set_skills");
    expect(skills).toBeDefined();
    if (skills?.type === "set_skills") {
      expect(skills.skillIds).toEqual(["ads_optimizer", "report_gen"]);
      expect(skills.nodes).toHaveLength(2);
    }
  });

  it("detects tools from skill keywords", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "google_ads_manager", name: "Google Ads Campaign Manager", source: "custom", status: "found", depends_on: [], external_api: "Google Ads API" },
          { skill_id: "slack_notifier", name: "Slack Notification", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const tools = directives.find(d => d.type === "connect_tools");
    expect(tools).toBeDefined();
    if (tools?.type === "connect_tools") {
      expect(tools.toolIds).toContain("google-ads");
      expect(tools.toolIds).toContain("slack");
    }
  });

  it("detects schedule trigger from cron_expression", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      agent_metadata: { cron_expression: "0 9 * * 1-5" },
      skill_graph: {
        nodes: [
          { skill_id: "daily_report", name: "Daily Report", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const triggers = directives.find(d => d.type === "set_triggers");
    expect(triggers).toBeDefined();
    if (triggers?.type === "set_triggers") {
      expect(triggers.triggerIds).toEqual(["cron-schedule"]);
    }
  });

  it("uses explicit architect tool and trigger payloads when the response includes structured config", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      tool_connections: [
        { tool_id: "google_ads", name: "Google Ads" },
        { tool_id: "slack", name: "Slack" },
      ],
      triggers: [
        { id: "weekday-pacing", kind: "schedule", title: "Weekday pacing check" },
        { id: "ads-webhook", kind: "webhook", title: "Incoming Ads webhook" },
      ],
      skill_graph: {
        nodes: [
          { skill_id: "campaign_monitor", name: "Campaign Monitor", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const tools = directives.find(d => d.type === "connect_tools");
    const triggers = directives.find(d => d.type === "set_triggers");

    expect(tools).toBeDefined();
    if (tools?.type === "connect_tools") {
      expect(tools.toolIds).toEqual(["google-ads", "slack"]);
      expect(tools.toolConnections).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolId: "google-ads" }),
        expect.objectContaining({ toolId: "slack" }),
      ]));
    }

    expect(triggers).toBeDefined();
    if (triggers?.type === "set_triggers") {
      expect(triggers.triggerIds).toEqual(["weekday-pacing", "ads-webhook"]);
      expect(triggers.triggers).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "weekday-pacing", kind: "schedule" }),
        expect.objectContaining({ id: "ads-webhook", kind: "webhook" }),
      ]));
    }
  });

  it("accepts raw architect alias fields for explicit tool and trigger config", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      tool_connections: [
        {
          tool_id: "google_ads",
          required_env: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_REFRESH_TOKEN"],
        },
      ],
      triggers: [
        {
          trigger_id: "weekday-pacing",
          name: "Weekday pacing check",
          kind: "schedule",
          cron_expression: "0 9 * * 1-5",
        },
      ],
      skill_graph: {
        nodes: [
          { skill_id: "campaign_monitor", name: "Campaign Monitor", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const tools = directives.find(d => d.type === "connect_tools");
    const triggers = directives.find(d => d.type === "set_triggers");

    expect(tools).toBeDefined();
    if (tools?.type === "connect_tools") {
      expect(tools.toolIds).toEqual(["google-ads"]);
      expect(tools.toolConnections).toEqual([
        expect.objectContaining({
          toolId: "google-ads",
          status: "missing_secret",
          configSummary: ["Required env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_REFRESH_TOKEN"],
        }),
      ]);
    }

    expect(triggers).toBeDefined();
    if (triggers?.type === "set_triggers") {
      expect(triggers.triggerIds).toEqual(["weekday-pacing"]);
      expect(triggers.triggers).toEqual([
        expect.objectContaining({
          id: "weekday-pacing",
          title: "Weekday pacing check",
          kind: "schedule",
          schedule: "0 9 * * 1-5",
        }),
      ]);
    }
  });

  it("uses webhook-post as the unsupported builder hint for inbound webhook flows", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      description: "Accept inbound webhook POSTs from ad platform alerts.",
      skill_graph: {
        nodes: [
          { skill_id: "alert_handler", name: "Alert Handler", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const triggers = directives.find(d => d.type === "set_triggers");
    expect(triggers).toBeDefined();
    if (triggers?.type === "set_triggers") {
      expect(triggers.triggerIds).toEqual(["webhook-post"]);
    }
  });

  it("extracts rules from metadata", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      agent_metadata: { tone: "professional", primary_users: "marketing team" },
      skill_graph: {
        nodes: [
          { skill_id: "campaign", name: "Campaign", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const rules = directives.find(d => d.type === "set_rules");
    expect(rules).toBeDefined();
    if (rules?.type === "set_rules") {
      expect(rules.rules.some(r => r.includes("professional"))).toBe(true);
      expect(rules.rules.some(r => r.includes("marketing team"))).toBe(true);
    }
  });

  it("advances to skills phase on ready_for_review", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [
          { skill_id: "test", name: "Test", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "workflow", steps: [] },
      },
    };

    const directives = parseWizardDirectives(response);
    const phase = directives.find(d => d.type === "set_phase");
    expect(phase).toBeDefined();
    if (phase?.type === "set_phase") {
      expect(phase.phase).toBe("skills");
    }
  });

  it("returns empty for plain agent_response", () => {
    const response: ArchitectResponse = {
      type: "agent_response",
      content: "Sure, I can help with that.",
    };

    const directives = parseWizardDirectives(response);
    // Plain text responses should not seed default tool or trigger hints.
    expect(directives.filter(d => d.type === "set_skills")).toHaveLength(0);
    expect(directives.filter(d => d.type === "set_triggers")).toHaveLength(0);
  });
});

describe("buildWizardStateContext", () => {
  it("builds context string from state", () => {
    const context = buildWizardStateContext({
      devStage: "tools",
      phase: "tools",
      name: "Ads Bot",
      description: "",
      selectedSkillIds: ["ads_optimizer"],
      connectedTools: [{ toolId: "google", name: "Google Workspace" } as never],
      triggers: [],
      agentRules: ["Professional tone"],
    });

    expect(context).toContain("[WIZARD_STATE]");
    expect(context).toContain("Dev Stage: tools");
    expect(context).toContain("Phase: tools");
    expect(context).toContain("Ads Bot");
    expect(context).toContain("ads_optimizer");
    expect(context).toContain("[/WIZARD_STATE]");
  });

  it("omits empty fields", () => {
    const context = buildWizardStateContext({
      devStage: "purpose",
      phase: "purpose",
      name: "",
      description: "",
      selectedSkillIds: [],
      connectedTools: [],
      triggers: [],
      agentRules: [],
    });

    expect(context).toContain("Phase: purpose");
    expect(context).not.toContain("Skills:");
    expect(context).not.toContain("Connected Tools:");
  });

  it("includes richer runtime, channel, plan, and soul context when present", () => {
    const context = buildWizardStateContext({
      devStage: "review",
      phase: "review",
      name: "Inventory Alert Bot",
      systemName: "inventory-alert-bot",
      description: "Monitors Shopify inventory every hour and posts ranked Slack restock alerts.",
      selectedSkillIds: ["inventory-monitor", "slack-alert-send"],
      builtSkillIds: ["inventory-monitor"],
      skillGraph: [
        { skill_id: "inventory-monitor", name: "Inventory Monitor", description: "Fetch inventory from Shopify." },
      ],
      connectedTools: [
        { toolId: "shopify", status: "configured" },
        { toolId: "slack", status: "missing_secret" },
      ],
      runtimeInputs: [
        { key: "SHOPIFY_STORE_DOMAIN", required: true, value: "acme-shop.myshopify.com" },
        { key: "SLACK_CHANNEL_ID", required: true, value: "" },
      ],
      triggers: [{ id: "cron-schedule", title: "Hourly Inventory Sweep" }],
      channels: [{ kind: "slack", status: "planned" }],
      improvements: [{ title: "Add urgency scoring", status: "accepted" }],
      architecturePlan: {
        skills: [{ id: "inventory-monitor", name: "Inventory Monitor", description: "Fetch inventory", dependencies: [], envVars: ["SHOPIFY_STORE_DOMAIN"] }],
        workflow: { steps: [{ skillId: "inventory-monitor", parallel: false }] },
        integrations: [{ toolId: "shopify", name: "Shopify", method: "api", envVars: ["SHOPIFY_STORE_DOMAIN"] }],
        triggers: [{ id: "cron-schedule", type: "cron", config: "0 * * * *", description: "Hourly" }],
        channels: ["slack"],
        envVars: [{ key: "SHOPIFY_STORE_DOMAIN", description: "Store", required: true }],
        subAgents: [],
        missionControl: null,
      },
      agentRules: ["Prioritize stockouts"],
    } as never);

    expect(context).toContain("Runtime Inputs: required 1/2 filled");
    expect(context).toContain("Channels: slack (planned)");
    expect(context).toContain("Architecture Plan:");
    expect(context).toContain("SOUL Summary:");
  });
});

// ─── Additional parseWizardDirectives coverage ────────────────────────────────

describe("parseWizardDirectives — additional branches", () => {
  it("emits no update_fields when agent has no name/description/system_name", () => {
    const response: ArchitectResponse = {
      type: "agent_response",
      content: "Hello",
    };
    const directives = parseWizardDirectives(response);
    expect(directives.find(d => d.type === "update_fields")).toBeUndefined();
  });

  it("uses system_name from response root when agent_metadata.agent_name is absent", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      system_name: "campaign-bot",
      skill_graph: {
        nodes: [
          { skill_id: "s1", name: "S1", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "wf", steps: [] },
      },
    };
    const directives = parseWizardDirectives(response);
    const fields = directives.find(d => d.type === "update_fields");
    expect(fields).toBeDefined();
    if (fields?.type === "update_fields") {
      expect(fields.name).toBe("campaign-bot");
    }
  });

  it("normalizes tool connection with name field as toolId fallback", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      tool_connections: [
        // Entry with name but no toolId — slugify should produce the toolId
        { name: "My Custom Tool" } as Record<string, unknown>,
      ],
      skill_graph: {
        nodes: [
          { skill_id: "s1", name: "S1", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "wf", steps: [] },
      },
    };
    const directives = parseWizardDirectives(response);
    const tools = directives.find(d => d.type === "connect_tools");
    expect(tools).toBeDefined();
    if (tools?.type === "connect_tools") {
      // slugify("My Custom Tool") = "my-custom-tool"
      expect(tools.toolIds[0]).toBe("my-custom-tool");
    }
  });

  it("normalizes trigger with name field when title and id are absent", () => {
    const response: ArchitectResponse = {
      type: "ready_for_review",
      triggers: [
        { name: "Weekday Check" } as unknown as import("./types").AgentTriggerDefinition,
      ],
      skill_graph: {
        nodes: [
          { skill_id: "s1", name: "S1", source: "custom", status: "found", depends_on: [] },
        ],
        workflow: { name: "main", description: "wf", steps: [] },
      },
    };
    const directives = parseWizardDirectives(response);
    const triggers = directives.find(d => d.type === "set_triggers");
    expect(triggers).toBeDefined();
    if (triggers?.type === "set_triggers") {
      expect(triggers.triggers[0].title).toBe("Weekday Check");
    }
  });
});

// ─── Additional buildWizardStateContext coverage ──────────────────────────────

describe("buildWizardStateContext — plan stage adds workspace context block", () => {
  it("adds WORKSPACE CONTEXT block when devStage is plan", () => {
    const context = buildWizardStateContext({
      devStage: "plan",
      phase: "plan",
      name: "Ads Bot",
      description: "",
      selectedSkillIds: [],
      connectedTools: [],
      triggers: [],
      agentRules: [],
    });
    expect(context).toContain("[WORKSPACE CONTEXT]");
    expect(context).toContain("PRD.md");
    expect(context).toContain("TRD.md");
  });

  it("includes heartbeat line when a trigger has a schedule field", () => {
    const context = buildWizardStateContext({
      phase: "tools",
      name: "Bot",
      description: "",
      selectedSkillIds: [],
      connectedTools: [],
      triggers: [{ id: "cron-1", title: "Daily Check", schedule: "0 9 * * 1-5" }],
      agentRules: [],
    });
    expect(context).toContain("Heartbeat:");
  });
});
