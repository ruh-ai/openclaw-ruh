import type { AgentData } from "./types";

export const INITIAL_AGENT_DATA: AgentData = {
  name: "Finance Assistant",
  rules: [
    "Always format numbers as currency",
    "Ensure consistent font sizes across all headings",
    "Use high-contrast colors for better readability",
    "Incorporate icons to enhance user experience",
  ],
  skills: ["email-triage", "Crm-updater", "slack-digest"],
  triggers: [
    { icon: "calendar", text: "Every Monday at 09:00 AM" },
    { icon: "heart", text: "Heartbeat every 30 min — Emails, Slack" },
  ],
  accessTeams: [
    "Finance Team",
    "Marketing Team",
    "Product Development Team",
    "Customer Support Team",
  ],
};
