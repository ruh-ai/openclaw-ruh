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
      phase: "tools",
      name: "Ads Bot",
      description: "",
      selectedSkillIds: ["ads_optimizer"],
      connectedTools: [{ toolId: "google", name: "Google Workspace" } as never],
      triggers: [],
      agentRules: ["Professional tone"],
    });

    expect(context).toContain("[WIZARD_STATE]");
    expect(context).toContain("Phase: tools");
    expect(context).toContain("Ads Bot");
    expect(context).toContain("ads_optimizer");
    expect(context).toContain("[/WIZARD_STATE]");
  });

  it("omits empty fields", () => {
    const context = buildWizardStateContext({
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
});
