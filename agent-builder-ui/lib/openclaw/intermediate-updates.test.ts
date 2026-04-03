import { describe, expect, it } from "bun:test";
import { extractIntermediateUpdates, type IntermediateUpdate } from "./intermediate-updates";

describe("extractIntermediateUpdates", () => {
  it("returns empty array for empty content", () => {
    const emitted = new Set<string>();
    const updates = extractIntermediateUpdates("", emitted);
    expect(updates).toEqual([]);
  });

  it("extracts identity from 'agent named' pattern", () => {
    const emitted = new Set<string>();
    const content = 'I will create an agent named "Campaign Monitor" that tracks Google Ads performance.';
    const updates = extractIntermediateUpdates(content, emitted);
    expect(updates.length).toBe(1);
    expect(updates[0].kind).toBe("identity");
    expect(updates[0].name).toBe("Campaign Monitor");
    expect(emitted.has("identity")).toBe(true);
  });

  it("extracts identity from 'I'll build' pattern", () => {
    const emitted = new Set<string>();
    const content = "I'll build a production-ready Performance Tracker agent that monitors campaigns.";
    const updates = extractIntermediateUpdates(content, emitted);
    expect(updates.length).toBe(1);
    expect(updates[0].kind).toBe("identity");
    expect(updates[0].name).toBe("Performance Tracker");
  });

  it("extracts identity from system_name pattern", () => {
    const emitted = new Set<string>();
    const content = 'system_name: "campaign-monitor"';
    const updates = extractIntermediateUpdates(content, emitted);
    expect(updates.length).toBe(1);
    expect(updates[0].kind).toBe("identity");
    expect(updates[0].name).toBe("Campaign Monitor");
  });

  it("extracts identity from SOUL.md heading pattern", () => {
    const emitted = new Set<string>();
    const content = "# You are Campaign Ads Agent\nYou help manage advertising campaigns daily.";
    const updates = extractIntermediateUpdates(content, emitted);
    expect(updates.length).toBe(1);
    expect(updates[0].kind).toBe("identity");
    expect(updates[0].name).toBe("Campaign Ads Agent");
  });

  it("does not re-emit identity once already emitted", () => {
    const emitted = new Set<string>(["identity"]);
    const content = 'agent named "Test Agent" that does something.';
    const updates = extractIntermediateUpdates(content, emitted);
    // Should not find identity updates, moves to skill scanning
    const identityUpdates = updates.filter((u) => u.kind === "identity");
    expect(identityUpdates.length).toBe(0);
  });

  it("extracts skills from skill path references after identity is emitted", () => {
    const emitted = new Set<string>(["identity"]);
    const content = "Writing skills/campaign-monitor.md and skills/budget-tracker.md for the agent.";
    const updates = extractIntermediateUpdates(content, emitted);
    const skillUpdates = updates.filter((u) => u.kind === "skill_discovered");
    expect(skillUpdates.length).toBe(2);
    expect(skillUpdates[0].skillId).toBe("campaign-monitor");
    expect(skillUpdates[0].name).toBe("Campaign Monitor");
    expect(skillUpdates[1].skillId).toBe("budget-tracker");
    expect(skillUpdates[1].name).toBe("Budget Tracker");
    expect(emitted.has("skill:campaign-monitor")).toBe(true);
    expect(emitted.has("skill:budget-tracker")).toBe(true);
  });

  it("does not re-emit already emitted skills", () => {
    const emitted = new Set<string>(["identity", "skill:campaign-monitor"]);
    const content = "Writing skills/campaign-monitor.md for the agent.";
    const updates = extractIntermediateUpdates(content, emitted);
    const skillUpdates = updates.filter((u) => u.kind === "skill_discovered");
    expect(skillUpdates.length).toBe(0);
  });

  it("extracts tool hints after skills are emitted", () => {
    const emitted = new Set<string>(["identity", "skill:ads-manager"]);
    const content = "This agent integrates with google ads and slack for notifications.";
    const updates = extractIntermediateUpdates(content, emitted);
    const toolUpdates = updates.filter((u) => u.kind === "tool_hint");
    expect(toolUpdates.length).toBe(2);
    const toolIds = toolUpdates.map((u) => u.toolId);
    expect(toolIds).toContain("google-ads");
    expect(toolIds).toContain("slack");
  });

  it("does not extract tools before skills are emitted", () => {
    const emitted = new Set<string>(["identity"]);
    const content = "This agent will use google ads and slack.";
    const updates = extractIntermediateUpdates(content, emitted);
    const toolUpdates = updates.filter((u) => u.kind === "tool_hint");
    expect(toolUpdates.length).toBe(0);
  });

  it("extracts trigger hints after tools are emitted", () => {
    const emitted = new Set<string>(["identity", "skill:tracker", "tool:google-ads"]);
    const content = "The agent runs on a cron schedule and listens for webhook callbacks.";
    const updates = extractIntermediateUpdates(content, emitted);
    const triggerUpdates = updates.filter((u) => u.kind === "trigger_hint");
    expect(triggerUpdates.length).toBeGreaterThanOrEqual(1);
    const triggerIds = triggerUpdates.map((u) => u.triggerId);
    expect(triggerIds).toContain("cron-schedule");
    expect(triggerIds).toContain("webhook-post");
  });

  it("does not extract triggers before tools are emitted", () => {
    const emitted = new Set<string>(["identity", "skill:tracker"]);
    const content = "The agent runs on a cron schedule.";
    const updates = extractIntermediateUpdates(content, emitted);
    const triggerUpdates = updates.filter((u) => u.kind === "trigger_hint");
    expect(triggerUpdates.length).toBe(0);
  });

  it("extracts channel hints after triggers are emitted", () => {
    const emitted = new Set<string>([
      "identity",
      "skill:tracker",
      "tool:slack",
      "trigger:cron-schedule",
    ]);
    const content = "Notifications are sent to telegram and discord channels.";
    const updates = extractIntermediateUpdates(content, emitted);
    const channelUpdates = updates.filter((u) => u.kind === "channel_hint");
    expect(channelUpdates.length).toBe(2);
    const channelIds = channelUpdates.map((u) => u.channelId);
    expect(channelIds).toContain("telegram");
    expect(channelIds).toContain("discord");
  });

  it("does not extract channels before triggers are emitted", () => {
    const emitted = new Set<string>(["identity", "skill:tracker", "tool:slack"]);
    const content = "Notifications go to telegram.";
    const updates = extractIntermediateUpdates(content, emitted);
    const channelUpdates = updates.filter((u) => u.kind === "channel_hint");
    expect(channelUpdates.length).toBe(0);
  });

  it("returns only identity on first call, gates subsequent phases", () => {
    const emitted = new Set<string>();
    const content =
      'I\'ll build Campaign Agent for tracking. Writing skills/campaign-tracker.md. Using google ads and slack. Runs on cron schedule. Alerts via telegram.';

    // First call should only return identity
    const firstUpdates = extractIntermediateUpdates(content, emitted);
    expect(firstUpdates.length).toBe(1);
    expect(firstUpdates[0].kind).toBe("identity");

    // Second call should find skills
    const secondUpdates = extractIntermediateUpdates(content, emitted);
    expect(secondUpdates.some((u) => u.kind === "skill_discovered")).toBe(true);
  });

  it("maps 'http post' keyword to webhook-post trigger", () => {
    const emitted = new Set<string>([
      "identity",
      "skill:tracker",
      "tool:slack",
      "trigger:cron-schedule",
    ]);
    const content = "Accepts http post requests for incoming data.";
    const updates = extractIntermediateUpdates(content, emitted);
    const triggerUpdates = updates.filter((u) => u.kind === "trigger_hint");
    // The trigger is extracted if not already emitted
    // Here we already have cron-schedule emitted, need to check for webhook-post
    // But triggers need to come before channels, so let's set the right emitted state
    const emitted2 = new Set<string>(["identity", "skill:tracker", "tool:slack"]);
    const updates2 = extractIntermediateUpdates(content, emitted2);
    const triggerUpdates2 = updates2.filter((u) => u.kind === "trigger_hint");
    expect(triggerUpdates2.some((u) => u.triggerId === "webhook-post")).toBe(true);
  });

  it("detects various tool keywords", () => {
    const emitted = new Set<string>(["identity", "skill:manager"]);
    const content = "The agent connects to jira, notion, and github for project management.";
    const updates = extractIntermediateUpdates(content, emitted);
    const toolIds = updates.filter((u) => u.kind === "tool_hint").map((u) => u.toolId);
    expect(toolIds).toContain("jira");
    expect(toolIds).toContain("notion");
    expect(toolIds).toContain("github");
  });
});
