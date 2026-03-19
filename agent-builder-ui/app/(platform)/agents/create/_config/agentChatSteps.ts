/**
 * Agent Creation Chat Steps Configuration
 *
 * Each step defines:
 * - id: unique identifier and key used to store the user's answer
 * - botMessage: what the bot says to the user
 * - options: predefined choices the user can pick from (also supports free-text via the input)
 * - responseTemplate: a function that produces the bot's follow-up after the user answers
 *
 * To change the conversation flow, edit the steps array below.
 */

export interface AgentChatOption {
  label: string;
  icon?: string; // emoji or lucide icon name
}

export interface AgentChatStep {
  id: string;
  botMessage: string;
  options: AgentChatOption[];
  responseTemplate: (answer: string) => string;
}

export const AGENT_GREETING = `Hi there! I'm Ruh AI agent builder.\n\nI'm here to help you create a custom AI agent in just a few steps — no code required. Think of me as your co-creator. I'll guide you through the process by asking a few simple questions.`;

export const AGENT_GREETING_SUBTITLE =
  "What do you want your agent to do? Describe it in plain words, like:";

export const AGENT_SUGGESTIONS: AgentChatOption[] = [
  {
    label: "An agent that handles customer support for my SaaS",
    icon: "MessageSquare",
  },
  {
    label: "An agent that summarizes reports and sends daily updates",
    icon: "FileText",
  },
  {
    label: "A sales agent that qualifies leads and books demos",
    icon: "TrendingUp",
  },
];

export const AGENT_CHAT_STEPS: AgentChatStep[] = [
  {
    id: "agentType",
    botMessage:
      "What do you want your agent to do? Describe it in plain words:",
    options: [
      { label: "Customer Support Agent" },
      { label: "Sales & Outreach Agent" },
      { label: "Research & Analysis Agent" },
      { label: "Content Creation Agent" },
    ],
    responseTemplate: (answer: string) =>
      `Great choice! ${answer} can handle incoming requests, route complex issues, and respond instantly — 24/7. Now let's personalise it. What industry or product will this agent support?`,
  },
  {
    id: "industry",
    botMessage: "What industry or product will this agent support?",
    options: [
      { label: "E-commerce" },
      { label: "Finance & Banking" },
      { label: "Healthcare" },
      { label: "SaaS / Technology" },
    ],
    responseTemplate: (answer: string) =>
      `Perfect. A ${answer} context helps the agent understand terminology and customer expectations specific to that domain. One more thing — where will this agent interact with your users?`,
  },
  {
    id: "channel",
    botMessage: "Where will this agent interact with your users?",
    options: [
      { label: "Website Chat Widget" },
      { label: "WhatsApp / SMS" },
      { label: "Email" },
      { label: "Slack / Teams" },
    ],
    responseTemplate: (answer: string) =>
      `Got it — ${answer} it is. Last question: what tone should the agent use when communicating?`,
  },
  {
    id: "tone",
    botMessage: "What tone should the agent use when communicating?",
    options: [
      { label: "Professional & formal" },
      { label: "Friendly & conversational" },
      { label: "Concise & direct" },
      { label: "Empathetic & supportive" },
    ],
    responseTemplate: (_answer: string) =>
      `I now have everything I need to bring your agent to life. Here's a quick summary of what we've configured:`,
  },
];

/**
 * Build the summary items from collected answers
 */
export function buildSummaryItems(
  answers: Record<string, string>
): { label: string; value: string }[] {
  return [
    { label: "Agent type", value: answers.agentType || "—" },
    { label: "Industry", value: answers.industry || "—" },
    { label: "Channel", value: answers.channel || "—" },
    { label: "Tone", value: answers.tone || "—" },
  ];
}
