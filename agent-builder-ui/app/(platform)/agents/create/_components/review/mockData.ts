import type { AgentData } from "./types";

export const INITIAL_AGENT_DATA: AgentData = {
  name: "Google Ads Optimizer",
  rules: [
    "Summarize campaign performance with explicit budget and conversion deltas",
    "Flag pacing risk before spend exceeds plan",
    "Keep recommendations focused on paid media operators",
  ],
  skills: ["Google Ads Audit", "Budget Pacing Report", "Bid Change Planner"],
  toolConnections: [
    {
      id: "google-ads",
      name: "Google Ads",
      description: "Inspect campaigns, budgets, and search-term performance.",
      status: "configured",
      statusLabel: "Configured",
      detail: "Connected account: Acme Ads",
    },
  ],
  triggers: [
    {
      icon: "calendar",
      text: "Weekday pacing check",
      statusLabel: "Supported schedule",
      detail: "0 9 * * 1-5",
    },
  ],
  improvements: [],
  accessTeams: [
    "Paid Media Team",
    "Growth Marketing",
  ],
};
