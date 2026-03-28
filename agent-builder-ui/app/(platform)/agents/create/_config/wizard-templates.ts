/**
 * Agent creation wizard templates.
 *
 * Each template pre-fills the wizard with sensible defaults for a common
 * agent archetype. Users can customise any field after applying a template.
 */

export type ToneOption = "professional" | "friendly" | "technical" | "custom";

export interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  tagline: string;        // one-liner shown on the card
  description: string;    // longer description pre-filled in Phase 1
  category: string;
  skills: string[];       // skill IDs matching MOCK_SKILLS / skill graph IDs
  tools: string[];        // tool IDs matching TOOL_PATTERNS
  tone: ToneOption;
  triggerIds: string[];   // trigger IDs matching MOCK_TRIGGER_CATEGORIES
  rules: string[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "google-ads-optimizer",
    name: "Google Ads Optimizer",
    emoji: "📈",
    tagline: "Audit campaigns, pace budgets, and surface bid actions",
    description: "Audits Google Ads campaigns, watches budget pacing, and prepares optimization actions for paid media managers.",
    category: "Marketing",
    skills: ["data-analysis"],
    tools: ["google"],
    tone: "professional",
    triggerIds: ["cron-schedule"],
    rules: [
      "Respond with campaign metrics, budget deltas, and explicit next actions",
      "Highlight pacing risk before spend exceeds plan",
      "Schedule: Runs every weekday at 9am",
    ],
  },
  {
    id: "devops-monitor",
    name: "DevOps Monitor",
    emoji: "🔧",
    tagline: "Monitor deploys, alert on failures, run health checks",
    description: "Monitors deployments, alerts on failures, and runs post-deploy health checks across services.",
    category: "Engineering",
    skills: ["task-automation"],
    tools: ["github"],
    tone: "technical",
    triggerIds: ["deploy-complete", "health-check-fail"],
    rules: [
      "Always include service name and timestamp in alerts",
      "Escalate P0 incidents to the on-call channel immediately",
    ],
  },
  {
    id: "customer-support",
    name: "Customer Support",
    emoji: "💬",
    tagline: "Triage tickets, draft replies, track resolution times",
    description: "Triages incoming support tickets, drafts reply suggestions, and tracks resolution time metrics.",
    category: "Support",
    skills: ["email-triage"],
    tools: ["slack"],
    tone: "friendly",
    triggerIds: ["message-received"],
    rules: [
      "Always acknowledge the customer within 2 minutes",
      "Escalate billing issues to the finance team",
      "Use empathetic language when addressing complaints",
    ],
  },
  {
    id: "content-writer",
    name: "Content Writer",
    emoji: "✍️",
    tagline: "Draft blog posts, social copy, internal comms",
    description: "Drafts blog posts, social media copy, and internal communications based on topic briefs.",
    category: "Marketing",
    skills: ["data-analysis"],
    tools: ["notion"],
    tone: "friendly",
    triggerIds: ["chat-command"],
    rules: [
      "Match the brand voice guide for all external content",
      "Include SEO keywords provided in the brief",
      "Keep paragraphs under 3 sentences for readability",
    ],
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    emoji: "📊",
    tagline: "Ingest data, transform schemas, generate reports",
    description: "Ingests data from multiple sources, transforms schemas, and generates automated reports on a schedule.",
    category: "Data",
    skills: ["data-analysis", "task-automation"],
    tools: ["google"],
    tone: "technical",
    triggerIds: ["cron-schedule"],
    rules: [
      "Log every ingestion run with row counts and duration",
      "Retry failed ingestions up to 3 times before alerting",
      "Schedule: Runs daily at 2am UTC",
    ],
  },
  {
    id: "slack-bot",
    name: "Slack Bot",
    emoji: "🤖",
    tagline: "Answer questions, run commands, post updates",
    description: "Responds to questions in Slack channels, runs slash commands, and posts scheduled team updates.",
    category: "Productivity",
    skills: ["task-automation"],
    tools: ["slack"],
    tone: "friendly",
    triggerIds: ["message-received", "chat-command"],
    rules: [
      "Only respond when mentioned or in designated channels",
      "Keep responses concise — under 200 words",
      "Thread long replies to avoid cluttering the channel",
    ],
  },
];
