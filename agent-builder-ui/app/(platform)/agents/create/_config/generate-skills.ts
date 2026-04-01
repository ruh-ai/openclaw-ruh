/**
 * Generate skills from the OpenClaw architect agent.
 *
 * Two-step flow:
 * 1. Discovery — architect returns structured intake questions
 * 2. Skill generation — architect returns a skill graph using discovery context
 *
 * The discovery step is optional; callers can skip straight to generation
 * with `generateSkillsFromArchitect` for backward compatibility.
 */

import { v4 as uuidv4 } from "uuid";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import type {
  ArchitectResponse,
  ArchitecturePlan,
  DiscoveryDocuments,
  DiscoveryQuestion,
  SkillGraphNode,
  WorkflowDefinition,
  WorkflowStep,
} from "@/lib/openclaw/types";
import { buildCapabilitiesContext } from "./capabilities-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedSkills {
  nodes: SkillGraphNode[];
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];
}

export interface GenerateSkillsCallbacks {
  onStatus?: (message: string) => void;
  onCustomEvent?: (name: string, data: unknown) => void;
}

// ─── Discovery Prompt (PRD + TRD) ────────────────────────────────────────────

export function buildDiscoveryPrompt(agentName: string, agentDescription: string): string {
  const capabilities = buildCapabilitiesContext();

  return `[INSTRUCTION]
You are the OpenClaw architect agent. The user wants to create an agent. Before building, you must produce a Product Requirements Document (PRD) and a Technical Requirements Document (TRD) that define what the agent should do and how it should be built.

Analyse the agent name and description below. Research what's needed, then return a JSON response with type "discovery" containing both documents.

${capabilities}

Return ONLY a valid JSON response in this format:
{
  "type": "discovery",
  "content": "Brief summary of what you've planned",
  "prd": {
    "title": "Product Requirements Document",
    "sections": [
      { "heading": "Problem Statement", "content": "What problem does this agent solve? Why does it need to exist?" },
      { "heading": "Target Users", "content": "Who will use this agent? What are their needs and expectations?" },
      { "heading": "Core Capabilities", "content": "List the 3-7 key things this agent must be able to do. Be specific and actionable." },
      { "heading": "User Flows", "content": "Describe the primary user journeys — how users will interact with this agent step by step." },
      { "heading": "Channels & Integrations", "content": "Which platforms should the agent be accessible through? (Telegram, Slack, Discord, web chat, etc.) Which external services does it need?" },
      { "heading": "Success Criteria", "content": "How do we know the agent is working correctly? What metrics or outcomes define success?" }
    ]
  },
  "trd": {
    "title": "Technical Requirements Document",
    "sections": [
      { "heading": "Architecture Overview", "content": "High-level design: how should this agent be structured? What components does it need?" },
      { "heading": "Skills & Workflow", "content": "List specific skills the agent needs. Describe the execution workflow and dependencies between skills." },
      { "heading": "External APIs & Tools", "content": "Which APIs, MCP tools, or CLI tools does this agent need? For each, specify the connection method (MCP/API/CLI) and required credentials." },
      { "heading": "Triggers & Scheduling", "content": "How should this agent be triggered? Cron schedule, webhook, manual, or event-driven? Include specific cron expressions if applicable." },
      { "heading": "Environment Variables", "content": "List all required environment variables (API keys, tokens, endpoints) with descriptions." },
      { "heading": "Data Flow & Storage", "content": "What data does the agent process? Where does it store state/artifacts? What format?" },
      { "heading": "Error Handling & Guardrails", "content": "What safety rules, rate limits, retry policies, and error handling patterns should be built in?" }
    ]
  }
}

IMPORTANT:
- Be SPECIFIC to this agent — no generic boilerplate. Every section should reference the actual use case.
- For "Skills & Workflow", list concrete skill names (kebab-case) that you would build.
- For "External APIs & Tools", reference actual API endpoints and authentication methods.
- For "Triggers & Scheduling", provide real cron expressions where applicable.
- For "Environment Variables", list actual variable names (e.g., SHOPIFY_ACCESS_TOKEN).
[/INSTRUCTION]

Agent name: ${agentName}
Agent purpose: ${agentDescription}

Generate the PRD and TRD now.`;
}

// ─── Skill Generation Prompt ─────────────────────────────────────────────────

export function buildSkillGenerationPrompt(
  agentName: string,
  agentDescription: string,
  discoveryContext?: Record<string, string | string[]>,
  discoveryDocuments?: DiscoveryDocuments,
  architecturePlan?: ArchitecturePlan,
): string {
  const capabilities = buildCapabilitiesContext();

  let discoverySection = "";
  let architectureSection = "";

  if (discoveryDocuments) {
    const formatDoc = (doc: DiscoveryDocuments["prd"] | DiscoveryDocuments["trd"]) =>
      doc.sections.map((s) => `### ${s.heading}\n${s.content}`).join("\n\n");

    discoverySection = `
## Approved Product Requirements
${formatDoc(discoveryDocuments.prd)}

## Approved Technical Requirements
${formatDoc(discoveryDocuments.trd)}

Build the agent EXACTLY according to these approved requirements. Do not deviate from the documented architecture, skills, tools, triggers, or environment variables.
`;
  } else if (discoveryContext) {
    discoverySection = `\n## User's Requirements (from discovery):\n${Object.entries(discoveryContext)
        .map(([key, val]) => `- ${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
        .join("\n")}\n`;
  }

  if (architecturePlan) {
    architectureSection = `
## Approved Architecture Plan
\`\`\`json
${JSON.stringify(architecturePlan, null, 2)}
\`\`\`

Treat this approved architecture plan as the source of truth for the build output:
- keep the same planned skill ids, workflow order, tools, triggers, channels, and environment variables
- build the skill graph from these planned skills instead of inventing a different set
- return a complete built skill payload, including the final \`skill_md\` for every skill node
`;
  }

  return `[INSTRUCTION]
You are the OpenClaw architect agent. The user has approved the requirements${architecturePlan ? " and architecture plan" : ""}. Now BUILD the agent.

You have shell access. The workspace lives at: ~/.openclaw/workspace/

## Your job — two steps:

### Step 1: Write all workspace files

Write each file using shell commands. This is required — the files ARE the agent.

For SOUL.md:
\`\`\`bash
mkdir -p ~/.openclaw/workspace && cat > ~/.openclaw/workspace/SOUL.md << 'ENDSOUL'
# Agent Name
...personality, purpose, behaviour rules, workflow...
ENDSOUL
\`\`\`

For each SKILL.md:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/skills/<skill-id> && cat > ~/.openclaw/workspace/skills/<skill-id>/SKILL.md << 'ENDSKILL'
---
name: <skill-id>
version: 1.0.0
description: "<one line>"
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [bash]
      env: [REQUIRED_ENV_VAR]
---
# Skill Name
## What This Skill Does
...
## Steps
...
ENDSKILL
\`\`\`

For tool configs:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/tools && cat > ~/.openclaw/workspace/tools/<tool-id>.json << 'ENDTOOL'
{ "id": "<tool-id>", "name": "Human Name", "type": "mcp", "description": "...", "env_vars": ["KEY"] }
ENDTOOL
\`\`\`

For trigger configs:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/triggers && cat > ~/.openclaw/workspace/triggers/<trigger>.json << 'ENDTRIGGER'
{ "type": "cron", "name": "...", "schedule": "0 9 * * *", "enabled": true, "message": "..." }
ENDTRIGGER
\`\`\`

### Step 2: After ALL files are written, return the skill graph JSON

\`\`\`ready_for_review
{
  "type": "ready_for_review",
  "system_name": "kebab-case-agent-name",
  "content": "Brief build summary",
  "skill_graph": {
    "nodes": [
      {
        "skill_id": "skill-id-you-wrote",
        "name": "Human Readable Name",
        "description": "What this skill does",
        "source": "custom",
        "depends_on": [],
        "requires_env": ["ENV_VAR_NAME"],
        "tool_type": "mcp|api|cli",
        "tool_id": "mcp-registry-id-if-mcp"
      }
    ],
    "workflow": { "steps": [] }
  }
}
\`\`\`

## Rules

- DO NOT ask clarification questions — use the provided context.
- Write files FIRST, then return the JSON. The files are the agent.
- Every skill in the JSON must correspond to a SKILL.md file you wrote.
- Write real, specific skill content — not placeholder text.

${capabilities}
${discoverySection}
${architectureSection}
[/INSTRUCTION]

Agent name: ${agentName}
Agent purpose: ${agentDescription}

Build the agent workspace now. Write all files, then return the skill graph JSON.`;
}

// ─── Workflow normalizer ──────────────────────────────────────────────────────

function normalizeWorkflow(
  raw: { steps: string[] } | WorkflowDefinition | null | undefined,
  nodes: SkillGraphNode[] | undefined,
  systemName: string | null,
): WorkflowDefinition | null {
  if (!raw) {
    if (!nodes || nodes.length === 0) return null;
    return {
      name: "main-workflow",
      description: `${systemName || "agent"} workflow`,
      steps: nodes.map((node, i) => ({
        id: `step-${i}`,
        action: "execute",
        skill: node.skill_id,
        wait_for: i > 0 ? [nodes[i - 1].skill_id] : [],
      })),
    };
  }

  const rawSteps = (raw as { steps: unknown }).steps;
  if (Array.isArray(rawSteps) && rawSteps.length > 0 && typeof rawSteps[0] === "string") {
    return {
      name: "main-workflow",
      description: `${systemName || "agent"} workflow`,
      steps: (rawSteps as string[]).map((skill, i) => ({
        id: `step-${i}`,
        action: "execute",
        skill,
        wait_for: i > 0 ? [(rawSteps as string[])[i - 1]] : [],
      })) as WorkflowStep[],
    };
  }

  return raw as WorkflowDefinition;
}

// ─── Rule extraction ──────────────────────────────────────────────────────────

function extractRules(response: ArchitectResponse): string[] {
  const meta = response.agent_metadata;
  const reqs = response.requirements;
  const rules: string[] = [];
  if (meta?.tone) rules.push(`Communicate in a ${meta.tone} tone`);
  if (meta?.schedule_description) rules.push(`Schedule: ${meta.schedule_description}`);
  else if (meta?.cron_expression) rules.push(`Runs on cron: ${meta.cron_expression}`);
  else if (reqs?.schedule) rules.push(`Schedule: ${reqs.schedule}`);
  if (meta?.primary_users) rules.push(`Intended for: ${meta.primary_users}`);
  if (reqs?.required_env_vars && reqs.required_env_vars.length > 0) {
    rules.push(`Requires env: ${reqs.required_env_vars.join(", ")}`);
  }
  return rules;
}

// ─── Discovery function ──────────────────────────────────────────────────────

export interface DiscoveryResult {
  questions: DiscoveryQuestion[];
  documents: DiscoveryDocuments | null;
  introMessage: string | null;
}

// ── Keyword detection for local PRD/TRD generation ──

const KNOWN_TOOLS: Record<string, { name: string; envVars: string[]; method: string }> = {
  shopify: { name: "Shopify", envVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"], method: "REST API" },
  "google ads": { name: "Google Ads", envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"], method: "Google Ads API" },
  slack: { name: "Slack", envVars: ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"], method: "MCP (Slack)" },
  github: { name: "GitHub", envVars: ["GITHUB_TOKEN"], method: "MCP (GitHub)" },
  jira: { name: "Jira", envVars: ["JIRA_API_TOKEN", "JIRA_BASE_URL", "JIRA_EMAIL"], method: "REST API" },
  linkedin: { name: "LinkedIn", envVars: ["LINKEDIN_API_KEY"], method: "REST API" },
  clearbit: { name: "Clearbit", envVars: ["CLEARBIT_API_KEY"], method: "REST API" },
  stripe: { name: "Stripe", envVars: ["STRIPE_SECRET_KEY"], method: "REST API" },
  twitter: { name: "Twitter/X", envVars: ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN"], method: "REST API" },
  instagram: { name: "Instagram", envVars: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"], method: "Meta Graph API" },
  notion: { name: "Notion", envVars: ["NOTION_API_KEY"], method: "REST API" },
  hubspot: { name: "HubSpot", envVars: ["HUBSPOT_ACCESS_TOKEN"], method: "REST API" },
  salesforce: { name: "Salesforce", envVars: ["SALESFORCE_ACCESS_TOKEN", "SALESFORCE_INSTANCE_URL"], method: "REST API" },
  zendesk: { name: "Zendesk", envVars: ["ZENDESK_API_TOKEN", "ZENDESK_SUBDOMAIN"], method: "REST API" },
  telegram: { name: "Telegram", envVars: ["TELEGRAM_BOT_TOKEN"], method: "Telegram Bot API" },
  discord: { name: "Discord", envVars: ["DISCORD_BOT_TOKEN"], method: "Discord API" },
};

const KNOWN_TRIGGERS: Array<{ keywords: string[]; name: string; type: string; cron?: string }> = [
  { keywords: ["daily schedule", "runs daily", "every day", "daily"], name: "Daily Schedule", type: "cron", cron: "0 9 * * *" },
  { keywords: ["hourly", "every hour"], name: "Hourly Schedule", type: "cron", cron: "0 * * * *" },
  { keywords: ["weekly", "every week"], name: "Weekly Schedule", type: "cron", cron: "0 9 * * 1" },
  { keywords: ["webhook", "form submission", "incoming request", "http trigger"], name: "Webhook Trigger", type: "webhook" },
  { keywords: ["on demand", "manual", "manually"], name: "Manual Trigger", type: "manual" },
];

const KNOWN_CHANNELS: Array<{ keywords: string[]; name: string }> = [
  { keywords: ["telegram"], name: "Telegram" },
  { keywords: ["slack"], name: "Slack" },
  { keywords: ["discord"], name: "Discord" },
];

function detectFromDescription(description: string) {
  const lower = description.toLowerCase();

  const tools = Object.entries(KNOWN_TOOLS)
    .filter(([keyword]) => lower.includes(keyword))
    .map(([, tool]) => tool);

  const triggers = KNOWN_TRIGGERS
    .filter(({ keywords }) => keywords.some((k) => lower.includes(k)));

  const channels = KNOWN_CHANNELS
    .filter(({ keywords }) => keywords.some((k) => lower.includes(k)));

  return { tools, triggers, channels };
}

function buildLocalDiscoveryDocuments(
  agentName: string,
  agentDescription: string,
): DiscoveryDocuments {
  const { tools, triggers, channels } = detectFromDescription(agentDescription);

  const toolsList = tools.length > 0
    ? tools.map((t) => `- **${t.name}** (${t.method})`).join("\n")
    : "- No specific external services detected. Add them here if needed.";

  const envVarsList = tools.length > 0
    ? tools.flatMap((t) => t.envVars).map((v) => `- \`${v}\``).join("\n")
    : "- Add required API keys and tokens here.";

  const triggersList = triggers.length > 0
    ? triggers.map((t) => `- **${t.name}**${t.cron ? ` (\`${t.cron}\`)` : ""} — ${t.type}`).join("\n")
    : "- Manual trigger (on-demand)";

  const channelsList = channels.length > 0
    ? channels.map((c) => `- **${c.name}**`).join("\n")
    : "- Web chat only (no messaging integration)";

  // Extract action verbs/capabilities from description
  const capabilityPatterns = [
    /(?:that|which|to)\s+([^,]+?)(?:,|and\s|$)/gi,
  ];
  const capabilities: string[] = [];
  for (const pattern of capabilityPatterns) {
    let match;
    while ((match = pattern.exec(agentDescription)) !== null) {
      const cap = match[1].trim();
      if (cap.length > 5 && cap.length < 100) {
        capabilities.push(cap.charAt(0).toUpperCase() + cap.slice(1));
      }
    }
  }

  const capabilitiesList = capabilities.length > 0
    ? capabilities.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : `1. ${agentDescription}`;

  return {
    prd: {
      title: "Product Requirements Document",
      sections: [
        {
          heading: "Problem Statement",
          content: `This agent automates tasks described as: "${agentDescription}"\n\nWithout this agent, these tasks would need to be done manually, leading to delays, inconsistencies, and missed opportunities.`,
        },
        {
          heading: "Target Users",
          content: "Define who will use this agent:\n- Primary users: [e.g., marketing team, operations, customer support]\n- How they interact: via chat, scheduled reports, or automated triggers",
        },
        {
          heading: "Core Capabilities",
          content: `The agent must be able to:\n${capabilitiesList}`,
        },
        {
          heading: "User Flows",
          content: "Primary workflow:\n1. Agent is triggered (scheduled or via webhook/manual)\n2. Agent executes its core tasks\n3. Results are delivered to the configured channels\n4. Errors are logged and reported",
        },
        {
          heading: "Channels & Integrations",
          content: `Communication channels:\n${channelsList}\n\nExternal services:\n${toolsList}`,
        },
        {
          heading: "Success Criteria",
          content: "The agent is successful when:\n- All configured tasks run without errors\n- Results are delivered to the correct channels on time\n- API rate limits are respected\n- Errors are handled gracefully with retry logic",
        },
      ],
    },
    trd: {
      title: "Technical Requirements Document",
      sections: [
        {
          heading: "Architecture Overview",
          content: `**${agentName}** is an OpenClaw agent that runs as a Docker container with skills, workflows, and triggers.\n\nEach capability is implemented as a separate skill (Markdown file). Skills are orchestrated via a workflow that defines execution order and dependencies.`,
        },
        {
          heading: "Skills & Workflow",
          content: `Based on the description, the agent needs these skills:\n${capabilities.map((c, i) => `- **skill-${i + 1}**: ${c}`).join("\n") || "- Define specific skills here"}\n\nWorkflow: Skills execute in sequence unless specified otherwise. Add parallel execution or conditional logic as needed.`,
        },
        {
          heading: "External APIs & Tools",
          content: `Required integrations:\n${toolsList}\n\nFor each tool, the agent will use the appropriate connection method (MCP for supported tools, REST API for others).`,
        },
        {
          heading: "Triggers & Scheduling",
          content: `The agent should be triggered by:\n${triggersList}\n\nModify the cron expressions or add additional triggers as needed.`,
        },
        {
          heading: "Environment Variables",
          content: `Required credentials and configuration:\n${envVarsList}\n\nAll sensitive values are stored as environment variables and injected at runtime. Never hardcode credentials.`,
        },
        {
          heading: "Data Flow & Storage",
          content: "- Agent state is stored in workspace files under `~/.openclaw/workspace/`\n- Artifacts and reports are written to `artifacts/` directory\n- Logs are written to standard output for monitoring\n- Define any additional storage needs here",
        },
        {
          heading: "Error Handling & Guardrails",
          content: "- Retry failed API calls up to 3 times with exponential backoff\n- Respect rate limits for all external APIs\n- Log errors and send alerts to configured channels\n- Never perform destructive actions without explicit approval\n- Add domain-specific safety rules here",
        },
      ],
    },
  };
}

/**
 * Generate discovery documents (PRD + TRD) from the agent description.
 *
 * Uses local template-based generation for instant, reliable results.
 * The user can edit the documents before approving.
 */
export async function generateDiscoveryQuestions(
  agentName: string,
  agentDescription: string,
  _callbacks?: GenerateSkillsCallbacks,
): Promise<DiscoveryResult> {
  // Generate PRD/TRD locally from the description — instant, no LLM dependency
  const documents = buildLocalDiscoveryDocuments(agentName, agentDescription);

  return {
    questions: [],
    documents,
    introMessage: null,
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateSkillsFromArchitect(
  agentName: string,
  agentDescription: string,
  callbacks?: GenerateSkillsCallbacks,
  discoveryContext?: Record<string, string | string[]>,
  discoveryDocuments?: DiscoveryDocuments,
  architecturePlan?: ArchitecturePlan,
  forgeSandboxId?: string,
): Promise<GeneratedSkills> {
  const sessionId = uuidv4();
  const prompt = buildSkillGenerationPrompt(
    agentName,
    agentDescription,
    discoveryContext,
    discoveryDocuments,
    architecturePlan,
  );

  callbacks?.onStatus?.("Connecting to architect agent...");

  // All paths now use WebSocket via sendToArchitectStreaming.
  // When forgeSandboxId is set, the route handler connects to the forge
  // container's gateway via WebSocket — full tool execution support.
  const response = await sendToArchitectStreaming(
    sessionId,
    prompt,
    {
      onStatus: (_phase, message) => {
        callbacks?.onStatus?.(message);
      },
      onCustomEvent: (name, data) => {
        callbacks?.onCustomEvent?.(name, data);
      },
    },
    {
      forgeSandboxId,
    },
  );

  callbacks?.onStatus?.("Processing skill graph...");

  // Handle the response based on type
  if (response.type === "ready_for_review" && response.skill_graph) {
    const systemName =
      response.system_name ||
      response.skill_graph.system_name ||
      agentName ||
      null;

    // Guard: nodes may be undefined if the architect returned a skill_graph
    // object without a nodes array (e.g. forge-chat edge cases).
    const nodes = response.skill_graph.nodes ?? [];

    if (nodes.length === 0) {
      throw new Error(
        "The architect returned an empty skill graph. This usually means the sandbox didn't generate skills from the requirements. Retrying may fix this."
      );
    }

    const workflow = normalizeWorkflow(
      response.skill_graph.workflow,
      nodes,
      systemName,
    );

    const agentRules = extractRules(response);

    return {
      nodes,
      workflow,
      systemName,
      agentRules,
    };
  }

  // If the architect returned a clarification or other type, extract what we can
  if (response.type === "clarification" || response.type === "agent_response") {
    throw new Error(
      response.content ||
      "The architect asked for clarification instead of generating skills. Try adding more detail to your description."
    );
  }

  if (response.type === "error") {
    throw new Error(response.content || response.error || "Architect returned an error");
  }

  throw new Error("Unexpected response from architect agent");
}

// ─── Allowed-tools inference ──────────────────────────────────────────────────

function inferAllowedTools(node: SkillGraphNode): string[] {
  const tools = new Set<string>(["Bash", "Read"]);

  const text = `${node.description ?? ""} ${node.external_api ?? ""} ${node.name}`.toLowerCase();

  if (text.includes("write") || text.includes("create") || text.includes("generate") || text.includes("send")) {
    tools.add("Write");
    tools.add("Edit");
  }
  if (text.includes("web") || text.includes("scrape") || text.includes("fetch") || text.includes("http") || text.includes("api")) {
    tools.add("WebFetch");
  }
  if (node.requires_env && node.requires_env.length > 0) {
    tools.add("Bash"); // needs env access
  }

  return Array.from(tools);
}

// ─── SKILL.md preview builder ─────────────────────────────────────────────────

/**
 * Generate a SKILL.md preview for a skill node.
 * This matches the format the backend writes to the sandbox container.
 */
export function buildSkillMarkdown(node: SkillGraphNode): string {
  const allowedTools = inferAllowedTools(node);
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`name: ${node.skill_id}`);
  lines.push("version: 1.0.0");
  lines.push(`description: "${node.description || node.name}"`);
  lines.push("allowed-tools:");
  for (const tool of allowedTools) {
    lines.push(`  - ${tool}`);
  }
  lines.push("user-invocable: true");
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# ${node.name}`);
  lines.push("");

  // Description
  if (node.description) {
    lines.push(node.description);
    lines.push("");
  }

  // Usage
  lines.push("## Usage");
  lines.push(`Invoke this skill when you need to ${(node.description || node.name).toLowerCase().replace(/\.$/, "")}.`);
  lines.push("");

  // Dependencies
  if (node.depends_on && node.depends_on.length > 0) {
    lines.push("## Dependencies");
    for (const dep of node.depends_on) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  }

  // Environment variables
  if (node.requires_env && node.requires_env.length > 0) {
    lines.push("## Required Environment Variables");
    for (const env of node.requires_env) {
      lines.push(`- \`${env}\``);
    }
    lines.push("");
  }

  // External API
  if (node.external_api) {
    lines.push("## External API");
    lines.push(`- ${node.external_api}`);
    lines.push("");
  }

  // Implementation
  lines.push("## Implementation");
  lines.push("When executing this skill:");
  lines.push(`1. Validate that all required environment variables are set`);
  if (node.external_api) {
    lines.push(`2. Connect to ${node.external_api} using the configured credentials`);
    lines.push("3. Execute the requested operation");
    lines.push("4. Return structured results to the operator");
  } else {
    lines.push("2. Execute the requested operation");
    lines.push("3. Return structured results to the operator");
  }
  lines.push("");

  return lines.join("\n");
}
