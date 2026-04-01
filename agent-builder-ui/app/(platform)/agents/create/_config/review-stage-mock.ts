/**
 * review-stage-mock.ts — Dev-only mock data to hydrate the CoPilot store
 * directly into the Review stage (devStage="review") for testing without
 * running the full Think → Plan → Build flow.
 *
 * Usage (browser console on localhost):
 *   __coPilotStore.getState().hydrateFromSeed(
 *     (await import("./agents/create/_config/review-stage-mock")).REVIEW_STAGE_MOCK
 *   )
 *
 * Or call hydrateReviewStageMock() from a dev button.
 */

import type { CoPilotState } from "@/lib/openclaw/copilot-state";
import type { ArchitecturePlan, SkillGraphNode } from "@/lib/openclaw/types";

const MOCK_SKILL_GRAPH: SkillGraphNode[] = [
  {
    skill_id: "ticket-triage",
    name: "Ticket Triage",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Classifies incoming support tickets by urgency and category, routes to the right queue.",
    requires_env: ["HELPDESK_API_KEY"],
    tool_type: "api",
    skill_md: "# Ticket Triage\nClassifies and routes support tickets.",
  },
  {
    skill_id: "knowledge-search",
    name: "Knowledge Base Search",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Searches the internal knowledge base for relevant articles and FAQ entries.",
    tool_type: "mcp",
    skill_md: "# Knowledge Base Search\nSearches docs for answers.",
  },
  {
    skill_id: "response-drafting",
    name: "Response Drafting",
    source: "custom",
    status: "approved",
    depends_on: ["ticket-triage", "knowledge-search"],
    description: "Drafts a customer-facing reply using knowledge base results and ticket context.",
    skill_md: "# Response Drafting\nDrafts customer replies.",
  },
  {
    skill_id: "escalation-handler",
    name: "Escalation Handler",
    source: "custom",
    status: "approved",
    depends_on: ["ticket-triage", "sentiment-analysis"],
    description: "Escalates unresolved or high-priority tickets to a human agent with full context.",
    requires_env: ["SLACK_WEBHOOK_URL"],
    tool_type: "api",
    skill_md: "# Escalation Handler\nEscalates tickets to humans.",
  },
  {
    skill_id: "sentiment-analysis",
    name: "Sentiment Analysis",
    source: "custom",
    status: "approved",
    depends_on: [],
    description: "Analyzes customer sentiment to flag frustrated or at-risk customers for priority handling.",
  },
];

const MOCK_ARCHITECTURE_PLAN: ArchitecturePlan = {
  skills: [
    {
      id: "ticket-triage",
      name: "Ticket Triage",
      description: "Classifies incoming support tickets by urgency and category.",
      dependencies: [],
      toolType: "api",
      envVars: ["HELPDESK_API_KEY"],
    },
    {
      id: "knowledge-search",
      name: "Knowledge Base Search",
      description: "Searches the internal knowledge base for relevant articles.",
      dependencies: [],
      toolType: "mcp",
      envVars: [],
    },
    {
      id: "response-drafting",
      name: "Response Drafting",
      description: "Drafts customer replies using KB results and ticket context.",
      dependencies: ["ticket-triage", "knowledge-search"],
      envVars: [],
    },
    {
      id: "escalation-handler",
      name: "Escalation Handler",
      description: "Escalates unresolved tickets to human agents.",
      dependencies: ["ticket-triage", "sentiment-analysis"],
      toolType: "api",
      envVars: ["SLACK_WEBHOOK_URL"],
    },
    {
      id: "sentiment-analysis",
      name: "Sentiment Analysis",
      description: "Analyzes customer sentiment for priority handling.",
      dependencies: [],
      envVars: [],
    },
  ],
  workflow: {
    steps: [
      { skillId: "ticket-triage", parallel: false },
      { skillId: "knowledge-search", parallel: true },
      { skillId: "sentiment-analysis", parallel: true },
      { skillId: "response-drafting", parallel: false },
      { skillId: "escalation-handler", parallel: false },
    ],
  },
  integrations: [
    {
      toolId: "zendesk",
      name: "Zendesk",
      method: "api",
      envVars: ["ZENDESK_SUBDOMAIN", "ZENDESK_API_TOKEN"],
    },
    {
      toolId: "slack-notifications",
      name: "Slack Notifications",
      method: "api",
      envVars: ["SLACK_WEBHOOK_URL"],
    },
    {
      toolId: "confluence-kb",
      name: "Confluence Knowledge Base",
      method: "mcp",
      envVars: ["CONFLUENCE_API_TOKEN", "CONFLUENCE_BASE_URL"],
    },
  ],
  triggers: [
    {
      id: "new-ticket-webhook",
      type: "webhook",
      config: "/webhooks/zendesk/new-ticket",
      description: "Fires when a new support ticket is created in Zendesk",
    },
    {
      id: "daily-summary-cron",
      type: "cron",
      config: "0 9 * * 1-5",
      description: "Daily summary of unresolved tickets (weekdays at 9am)",
    },
    {
      id: "manual-review",
      type: "manual",
      config: "manual",
      description: "Manual trigger for ad-hoc ticket review",
    },
  ],
  channels: ["Slack", "Email", "Zendesk Widget"],
  envVars: [
    { key: "ZENDESK_SUBDOMAIN", description: "Your Zendesk subdomain (e.g. mycompany)", required: true },
    { key: "ZENDESK_API_TOKEN", description: "Zendesk API authentication token", required: true },
    { key: "HELPDESK_API_KEY", description: "Internal helpdesk API key for ticket triage", required: true },
    { key: "SLACK_WEBHOOK_URL", description: "Slack incoming webhook URL for escalation notifications", required: true },
    { key: "CONFLUENCE_API_TOKEN", description: "Confluence API token for knowledge base access", required: false },
    { key: "CONFLUENCE_BASE_URL", description: "Confluence base URL (e.g. https://mycompany.atlassian.net/wiki)", required: false },
    { key: "SENTIMENT_THRESHOLD", description: "Minimum negative sentiment score to trigger priority escalation (0-1)", required: false },
  ],
  subAgents: [
    {
      id: "escalation-bot",
      name: "Escalation Bot",
      description: "Handles ticket escalation workflow, notifies on-call human agents, and tracks resolution.",
      type: "worker",
      skills: ["escalation-handler"],
      trigger: "On high-priority or unresolved ticket",
      autonomy: "requires_approval",
    },
    {
      id: "analytics-reporter",
      name: "Analytics Reporter",
      description: "Generates daily/weekly support metrics, response time analysis, and satisfaction trends.",
      type: "monitor",
      skills: ["sentiment-analysis"],
      trigger: "daily-summary-cron",
      autonomy: "fully_autonomous",
    },
  ],
  missionControl: null,
};

/**
 * Full mock seed that puts the CoPilot store into the Review stage
 * with realistic Customer Support Agent data.
 */
export const REVIEW_STAGE_MOCK: Partial<CoPilotState> = {
  name: "Customer Support Agent",
  description: "An AI agent that triages support tickets, searches the knowledge base, drafts responses, and escalates when needed.",
  systemName: "customer-support",

  // Discovery completed
  discoveryStatus: "ready",
  discoveryDocuments: {
    prd: {
      title: "Customer Support Agent PRD",
      sections: [
        { heading: "Problem", content: "Support team is overwhelmed with ticket volume. Average first-response time is 4 hours." },
        { heading: "Solution", content: "AI agent that auto-triages, drafts responses from KB, and escalates complex issues." },
        { heading: "Success Metrics", content: "Reduce first-response time to <15 minutes. Auto-resolve 40% of L1 tickets." },
      ],
    },
    trd: {
      title: "Customer Support Agent TRD",
      sections: [
        { heading: "Architecture", content: "5-skill pipeline: triage → (KB search || sentiment) → draft → escalate." },
        { heading: "Integrations", content: "Zendesk API for tickets, Confluence MCP for KB, Slack webhooks for escalation." },
      ],
    },
  },

  // Skill graph fully built
  skillGraph: MOCK_SKILL_GRAPH,
  selectedSkillIds: MOCK_SKILL_GRAPH.map((n) => n.skill_id),
  builtSkillIds: MOCK_SKILL_GRAPH.filter((n) => n.skill_md).map((n) => n.skill_id),
  skillGenerationStatus: "ready",
  workflow: {
    name: "Customer Support Pipeline",
    description: "Triage → (KB Search || Sentiment) → Draft → Escalate",
    steps: [
      { id: "step-1", action: "run", skill: "ticket-triage", wait_for: [] },
      { id: "step-2", action: "run", skill: "knowledge-search", wait_for: ["step-1"] },
      { id: "step-3", action: "run", skill: "sentiment-analysis", wait_for: ["step-1"] },
      { id: "step-4", action: "run", skill: "response-drafting", wait_for: ["step-2", "step-3"] },
      { id: "step-5", action: "run", skill: "escalation-handler", wait_for: ["step-4"] },
    ],
  },

  // Architecture plan
  architecturePlan: MOCK_ARCHITECTURE_PLAN,

  // Connected tools (AgentToolConnection shape)
  connectedTools: [
    { toolId: "zendesk", name: "Zendesk", description: "Helpdesk ticketing platform", status: "configured" as const, authKind: "api_key" as const, connectorType: "api" as const, configSummary: ["Subdomain configured", "API token set"] },
    { toolId: "slack-notifications", name: "Slack Notifications", description: "Team notification channel", status: "configured" as const, authKind: "api_key" as const, connectorType: "api" as const, configSummary: ["Webhook URL configured"] },
    { toolId: "confluence-kb", name: "Confluence Knowledge Base", description: "Internal documentation", status: "missing_secret" as const, authKind: "api_key" as const, connectorType: "mcp" as const, configSummary: ["Base URL set", "API token missing"] },
  ],

  // Triggers (AgentTriggerDefinition shape)
  triggers: [
    { id: "new-ticket-webhook", title: "New Ticket Webhook", kind: "webhook" as const, status: "supported" as const, description: "Fires when a new support ticket is created in Zendesk" },
    { id: "daily-summary-cron", title: "Daily Summary", kind: "schedule" as const, status: "supported" as const, description: "Daily summary of unresolved tickets (weekdays at 9am)", schedule: "0 9 * * 1-5" },
    { id: "manual-review", title: "Manual Review", kind: "manual" as const, status: "supported" as const, description: "Manual trigger for ad-hoc ticket review" },
  ],

  // Channels (AgentChannelSelection shape)
  channels: [
    { kind: "slack" as const, status: "configured" as const, label: "Slack", description: "Post escalations and summaries to Slack" },
  ],

  // Runtime inputs (AgentRuntimeInput shape)
  runtimeInputs: [
    { key: "ZENDESK_SUBDOMAIN", label: "Zendesk Subdomain", description: "Your Zendesk subdomain", required: true, source: "architect_requirement" as const, value: "" },
    { key: "ZENDESK_API_TOKEN", label: "Zendesk API Token", description: "Zendesk authentication token", required: true, source: "architect_requirement" as const, value: "" },
    { key: "HELPDESK_API_KEY", label: "Helpdesk API Key", description: "Internal helpdesk API key", required: true, source: "skill_requirement" as const, value: "" },
    { key: "SLACK_WEBHOOK_URL", label: "Slack Webhook URL", description: "Slack incoming webhook URL", required: true, source: "architect_requirement" as const, value: "" },
  ],

  // Agent rules
  agentRules: [
    "Always acknowledge the customer's issue within the first sentence of a response.",
    "Never share internal ticket IDs or system details with customers.",
    "Escalate to a human agent if sentiment score is below 0.3 or if the customer requests a human.",
    "Use professional but friendly tone. Avoid jargon.",
    "Include relevant KB article links in responses when available.",
  ],

  // Lifecycle stage
  devStage: "review",
  thinkStatus: "approved",
  planStatus: "approved",
  buildStatus: "done",
  evalStatus: "idle",
  deployStatus: "idle",
};

/**
 * Full mock seed that puts the CoPilot store into the Test stage
 * with realistic Customer Support Agent data + eval tasks.
 */
export const TEST_STAGE_MOCK: Partial<CoPilotState> = {
  ...REVIEW_STAGE_MOCK,
  devStage: "test",
  evalStatus: "ready",
  evalTasks: [
    {
      id: "eval-1",
      title: "Triage a billing inquiry",
      input: "Hi, I was charged twice for my subscription last month. Can you help?",
      expectedBehavior: "Agent classifies as billing/medium-priority, searches KB for duplicate charge policy, drafts a refund-process response.",
      status: "pending",
    },
    {
      id: "eval-2",
      title: "Escalate angry customer",
      input: "This is the THIRD time I'm writing about this. Your product is broken and nobody is helping. I want to speak to a manager NOW.",
      expectedBehavior: "Agent detects negative sentiment (< 0.3), classifies as high-priority, escalates to human agent with full context via Slack.",
      status: "pending",
    },
    {
      id: "eval-3",
      title: "Answer from knowledge base",
      input: "How do I reset my password?",
      expectedBehavior: "Agent finds the password reset article in the KB, drafts a response with step-by-step instructions and includes the KB article link.",
      status: "pending",
    },
    {
      id: "eval-4",
      title: "Handle multi-topic request",
      input: "I need to upgrade my plan and also my last invoice has a wrong address. Can you fix both?",
      expectedBehavior: "Agent identifies two distinct issues (plan upgrade + invoice correction), triages both, and drafts a response addressing each topic.",
      status: "pending",
    },
    {
      id: "eval-5",
      title: "Graceful unknown topic handling",
      input: "Can you book me a flight to Tokyo next week?",
      expectedBehavior: "Agent recognizes out-of-scope request, responds politely that it only handles support tickets, and suggests contacting the appropriate team.",
      status: "pending",
    },
  ],
};

/**
 * Mock for test stage with pre-completed results (useful for testing the approve flow).
 */
export const TEST_STAGE_COMPLETED_MOCK: Partial<CoPilotState> = {
  ...TEST_STAGE_MOCK,
  evalStatus: "done",
  evalTasks: [
    {
      id: "eval-1",
      title: "Triage a billing inquiry",
      input: "Hi, I was charged twice for my subscription last month. Can you help?",
      expectedBehavior: "Agent classifies as billing/medium-priority, searches KB for duplicate charge policy, drafts a refund-process response.",
      status: "pass",
      response: "I understand you were charged twice for your subscription. I've found our duplicate charge policy and initiated a refund request. You should see the credit within 3-5 business days.",
      toolsUsed: ["ticket-triage", "knowledge-search", "response-drafting"],
      duration: 1850,
    },
    {
      id: "eval-2",
      title: "Escalate angry customer",
      input: "This is the THIRD time I'm writing about this. Your product is broken and nobody is helping. I want to speak to a manager NOW.",
      expectedBehavior: "Agent detects negative sentiment (< 0.3), classifies as high-priority, escalates to human agent with full context via Slack.",
      status: "pass",
      response: "I completely understand your frustration and I'm sorry for the repeated inconvenience. I've escalated this to a senior support agent who will reach out within the next 30 minutes.",
      toolsUsed: ["ticket-triage", "sentiment-analysis", "escalation-handler"],
      duration: 2100,
    },
    {
      id: "eval-3",
      title: "Answer from knowledge base",
      input: "How do I reset my password?",
      expectedBehavior: "Agent finds the password reset article in the KB, drafts a response with step-by-step instructions and includes the KB article link.",
      status: "pass",
      response: "Here's how to reset your password: 1) Go to Settings > Security, 2) Click 'Reset Password', 3) Follow the email link. Full guide: https://help.example.com/password-reset",
      toolsUsed: ["knowledge-search", "response-drafting"],
      duration: 1200,
    },
    {
      id: "eval-4",
      title: "Handle multi-topic request",
      input: "I need to upgrade my plan and also my last invoice has a wrong address. Can you fix both?",
      expectedBehavior: "Agent identifies two distinct issues (plan upgrade + invoice correction), triages both, and drafts a response addressing each topic.",
      status: "fail",
      response: "I can help with your plan upgrade! Please visit our pricing page to select a new plan.",
      toolsUsed: ["ticket-triage", "response-drafting"],
      duration: 1600,
    },
    {
      id: "eval-5",
      title: "Graceful unknown topic handling",
      input: "Can you book me a flight to Tokyo next week?",
      expectedBehavior: "Agent recognizes out-of-scope request, responds politely that it only handles support tickets, and suggests contacting the appropriate team.",
      status: "pass",
      response: "I appreciate you reaching out! However, I'm a customer support agent and can only help with support tickets and account issues. For travel bookings, please contact our travel desk.",
      toolsUsed: ["ticket-triage", "response-drafting"],
      duration: 950,
    },
  ],
};

/**
 * Full mock seed for the Ship stage — tests approved, ready to deploy.
 */
export const SHIP_STAGE_MOCK: Partial<CoPilotState> = {
  ...REVIEW_STAGE_MOCK,
  devStage: "ship",
  evalStatus: "done",
  evalTasks: TEST_STAGE_COMPLETED_MOCK.evalTasks,
  deployStatus: "idle",
};

/**
 * Full mock seed for the Reflect stage — agent deployed, build summary ready.
 */
export const REFLECT_STAGE_MOCK: Partial<CoPilotState> = {
  ...SHIP_STAGE_MOCK,
  devStage: "reflect",
  deployStatus: "done",
  buildReport: {
    agentName: "Customer Support Agent",
    createdAt: new Date().toISOString(),
    stages: [
      { stage: "think", status: "completed" },
      { stage: "plan", status: "completed" },
      { stage: "build", status: "completed" },
      { stage: "review", status: "completed" },
      { stage: "test", status: "completed" },
      { stage: "ship", status: "completed" },
      { stage: "reflect", status: "completed" },
    ],
    skillCount: 5,
    subAgentCount: 2,
    integrationCount: 3,
    triggerCount: 3,
    notes: "All tests passed. Agent deployed successfully with GitHub template export.",
  },
};

/**
 * Hydrate the CoPilot store with mock data and jump to the Review stage.
 * Call this from a dev button or browser console.
 */
export function hydrateReviewStageMock(): void {
  const { useCoPilotStore } = require("@/lib/openclaw/copilot-state");
  useCoPilotStore.getState().hydrateFromSeed(REVIEW_STAGE_MOCK);
}
