/**
 * BuilderAgent — AG-UI AbstractAgent wrapping the architect agent bridge.
 *
 * Sends messages to POST /api/openclaw (SSE) and emits AG-UI events.
 * Replaces builder-chat-transport.ts.
 */

import { Observable } from "rxjs";
import { AbstractAgent } from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import type { BaseEvent, RunAgentInput } from "@ag-ui/core";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import type { IntermediateUpdate } from "../intermediate-updates";
import type { OpenClawRequestMode } from "../test-mode";
import type {
  ArchitectResponse,
  ClarificationQuestion,
  SkillGraphNode,
  WorkflowDefinition,
  WorkflowStep,
} from "../types";
import { CustomEventName } from "./types";
import type { SkillGraphReadyPayload } from "./types";
import { parseWizardDirectives, buildWizardStateContext } from "../wizard-directive-parser";
import { detectChannelHintIds } from "../builder-hint-normalization";
import { processResponse, type EventContext } from "./event-registry";
import { tracer } from "./event-tracer";

// ─── System instruction for conversational builder ──────────────────────────

// ─── Think-stage system instruction ─────────────────────────────────────────
// ONLY produces PRD + TRD. Does NOT build anything.

export const THINK_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in THINK mode. Your ONLY job is to produce two documents:
1. A Product Requirements Document (PRD)
2. A Technical Requirements Document (TRD)

You must NOT build anything. No skills, no SOUL.md, no config files, no code. ONLY produce the two requirement documents.

Use your browser and terminal tools to research:
- What APIs and services exist for the domain
- Rate limits, authentication methods, pricing
- Best practices and common patterns
- Existing ClawHub skills that could be reused

CRITICAL OUTPUT RULE: You MUST output the JSON directly in your text response — NOT via a tool call, NOT via exec/terminal, NOT via file_write. Just print the JSON block as part of your message text. The frontend parses it from your text output.

Output your response as a JSON code block:

\`\`\`ready_for_review
{
  "type": "discovery",
  "system_name": "kebab-case-agent-name",
  "content": "Brief summary of your research findings",
  "prd": {
    "title": "Product Requirements Document",
    "sections": [
      { "heading": "Problem Statement", "content": "What problem does this agent solve? Be specific to the use case." },
      { "heading": "Target Users", "content": "Who will use this agent and how?" },
      { "heading": "Core Capabilities", "content": "List 3-7 specific things this agent must do." },
      { "heading": "User Flows", "content": "Step-by-step user journeys." },
      { "heading": "Channels & Integrations", "content": "Which platforms and external services?" },
      { "heading": "Success Criteria", "content": "How do we know it works?" }
    ]
  },
  "trd": {
    "title": "Technical Requirements Document",
    "sections": [
      { "heading": "Architecture Overview", "content": "High-level agent design." },
      { "heading": "Skills & Workflow", "content": "List specific skill names (kebab-case) and execution flow." },
      { "heading": "External APIs & Tools", "content": "APIs, MCP tools, CLI tools needed with auth methods." },
      { "heading": "Triggers & Scheduling", "content": "Cron expressions, webhooks, manual triggers." },
      { "heading": "Environment Variables", "content": "List all required env vars with descriptions." },
      { "heading": "Data Flow & Storage", "content": "What data is processed and where stored." },
      { "heading": "Error Handling & Guardrails", "content": "Safety rules, rate limits, retry policies." }
    ]
  }
}
\`\`\`

IMPORTANT:
- Every section must be SPECIFIC to the user's agent — no generic boilerplate.
- Research real APIs before writing the TRD (use browser to check docs).
- List actual environment variable names (e.g., SHOPIFY_ACCESS_TOKEN).
- Provide real cron expressions where applicable.
- The user will review and edit these documents before you build anything.

REMEMBER: Output the JSON code block DIRECTLY in your message. Do NOT use exec, terminal, or file_write tools to output it. The JSON must appear in your text response so the frontend can parse it.
[/INSTRUCTION]`;

// ─── Plan-stage system instruction ──────────────────────────────────────────

export const PLAN_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in PLAN mode. You have already produced PRD and TRD documents. Now your ONLY job is to create a structured Architecture Plan.

You must NOT build anything. No skills, no SOUL.md, no config files, no code. ONLY produce the architecture plan JSON.

The user's message will contain the approved PRD and TRD. Use them to design:
1. Skill definitions (name, description, dependencies, tool type)
2. Workflow (execution order, parallel steps)
3. Integrations (which tools/APIs, connection method: mcp/api/cli)
4. Triggers (cron schedules, webhooks, manual)
5. Channels (telegram, slack, discord)
6. Environment variables (all required keys with descriptions)
7. Sub-agents if the agent is complex enough to need delegation

CRITICAL OUTPUT RULE: You MUST output the JSON directly in your text response — NOT via a tool call, NOT via exec/terminal, NOT via file_write.

Output your response as a JSON code block:

\`\`\`ready_for_review
{
  "type": "architecture_plan",
  "system_name": "kebab-case-agent-name",
  "content": "Brief summary of the architecture decisions",
  "architecture_plan": {
    "skills": [
      {
        "id": "kebab-case-skill-id",
        "name": "Human Readable Name",
        "description": "What this skill does",
        "dependencies": ["other-skill-id"],
        "externalApi": "API name if applicable",
        "toolType": "mcp | api | cli",
        "envVars": ["ENV_VAR_NAME"]
      }
    ],
    "workflow": {
      "steps": [
        { "skillId": "skill-id", "parallel": false }
      ]
    },
    "integrations": [
      {
        "toolId": "tool-registry-id",
        "name": "Tool Name",
        "method": "mcp | api | cli",
        "envVars": ["ENV_VAR_NAME"]
      }
    ],
    "triggers": [
      {
        "id": "trigger-id",
        "type": "cron | webhook | manual",
        "config": "*/15 * * * * or /webhook/path or manual",
        "description": "When and why this trigger fires"
      }
    ],
    "channels": ["slack", "telegram"],
    "envVars": [
      {
        "key": "ENV_VAR_NAME",
        "description": "What this variable is for",
        "required": true
      }
    ],
    "subAgents": [],
    "missionControl": null
  }
}
\`\`\`

IMPORTANT:
- Every skill must have a unique kebab-case ID.
- Skills should be granular — one skill per capability (e.g., "shopify-inventory-fetch", "slack-alert-send").
- List REAL env var names based on the TRD research (e.g., SHOPIFY_ADMIN_ACCESS_TOKEN, not GENERIC_API_KEY).
- Provide actual cron expressions from the TRD.
- Set toolType to "mcp" for known MCP tools (github, slack, google), "api" for REST/GraphQL APIs, "cli" for command-line tools.
- Only include sub-agents if the agent is genuinely complex enough to need delegation.
- The user will review and edit this plan before you build anything.

REMEMBER: Output the JSON code block DIRECTLY in your message. Do NOT use exec, terminal, or file_write tools.
[/INSTRUCTION]`;

// ─── Review/Refine-stage system instruction ────────────────────────────────

export const REFINE_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in REFINE mode.

The agent already has a defined mission and an in-progress configuration. Your job is to refine that current agent in place.

Use the current wizard state as the source of truth:
- agent name and description
- selected skills and built skills
- tools and their readiness
- runtime inputs
- triggers / heartbeat
- channels
- accepted improvements
- architecture plan
- SOUL summary

Rules:
- Stay aligned to the current named agent. Do NOT invent a different agent idea.
- Do NOT restart from scratch unless the user explicitly asks for a redesign.
- When the user asks for changes to skills, tools, triggers, runtime inputs, channels, or rules, keep the response grounded in the current config and return structured updates when appropriate.
- When the user asks an advisory question, answer briefly and concretely about the current agent only.
- Prioritize coherence between tools, schedule/heartbeat, SOUL, and deployment readiness.
[/INSTRUCTION]
`;

// ─── Build-stage system instruction (the original full builder) ─────────────

export const BUILDER_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent for building production-ready OpenClaw agents. You have browser, terminal, file tools, ClawHub skill registry (\`openclaw skills search/install\`), and the skill-creator.

CRITICAL RULES:
- NEVER ask the user clarifying questions. Make reasonable assumptions and build the agent.
- NEVER ask "what do you prefer" or "how technical are they" — just decide and execute.
- If the user's request is ambiguous, pick the best default and document your assumptions in SOUL.md.
- Your job is to BUILD, not to interview. The user wants a working agent, not a conversation.
- Execute ALL steps in ONE turn. Do NOT stop after the plan — research, build skills, write all config files, and output the final design. The user will not send follow-up messages to continue.

## What You Produce

You build a **complete, deployable agent template** — not just a skill graph. The output includes:

1. **SOUL.md** — The agent's identity, mission, rules, and behavior (the system prompt)
2. **Skills** — Full SKILL.md files for each capability (created in the workspace)
3. **Sub-agents** — Specialized agents that the main agent delegates to (if needed)
4. **Workflows** — Step-by-step execution flows with dependencies
5. **Cron jobs** — Scheduled triggers with cron expressions
6. **Triggers** — Manual, schedule, webhook definitions
7. **Tool connections** — MCP tools and API integrations needed
8. **Credentials** — Required environment variables and auth setup

## Workflow (all in one turn)

### Step 1: Plan
<plan>
- [ ] Understand requirements — domain, users, integrations
- [ ] Research APIs, services, and best practices
- [ ] Search ClawHub and build skills
- [ ] Write agent configuration files
- [ ] Output the complete agent template
</plan>

### Step 2: Research (use your tools)
- \`openclaw skills search <domain>\` — find existing skills
- Browser — search for API docs, SDKs, auth methods, rate limits, real examples
- Terminal — verify packages, test endpoints, check available tools

Update progress: \`<task_update index="0" status="done"/>\`

Research must answer:
- What APIs/services? (endpoints, auth, rate limits, pricing)
- What triggers? (cron schedule, webhook, event-driven, manual)
- What workflow? (sequential pipeline, parallel fan-out, event loop)
- What sub-agents? (does this need specialized agents for different tasks?)
- What credentials/env vars?

### Step 3: Build skills and config
For EACH skill:
1. Search ClawHub: \`openclaw skills search <name>\`
2. Install if found: \`openclaw skills install <name>\`
3. Create custom SKILL.md for gaps:

\`\`\`bash
mkdir -p ~/.openclaw/workspace/skills/<skill-id>
cat > ~/.openclaw/workspace/skills/<skill-id>/SKILL.md << 'EOF'
---
name: <skill-id>
version: 1.0.0
description: "What this skill does and when to use it."
user-invocable: false
---
# Skill Name
## Process
1. Specific steps with API calls, CLI commands
2. Error handling and retries
3. Output format
## Required credentials
- ENV_VAR: description
EOF
\`\`\`

Then write **SOUL.md** for the agent:
\`\`\`bash
cat > ~/.openclaw/workspace/SOUL.md << 'SOULEOF'
# You are {agent-name}

You are an AI agent named **{agent-name}**. {description}.

## Your Mission
{What the agent does and why it exists}

## Your Skills
- **{skill-name}**: {what it does}
- **{skill-name}**: {what it does}

## Sub-Agents
- **{sub-agent-name}**: {role and when to delegate to it}

## Workflow
{Step-by-step execution flow — what happens on each trigger}

### On Schedule ({cron description})
1. {step 1}
2. {step 2}
3. {step 3}

### On Message Received
1. {step 1}
2. {step 2}

## Rules
- {behavior rule}
- {error handling rule}
- {output format rule}

## Configured Tools
- {tool}: {what it provides}

## Triggers
- Schedule: {cron expression} — {description}
- Manual: {when to invoke manually}
SOULEOF
\`\`\`

Verify: \`openclaw skills list\` and \`cat ~/.openclaw/workspace/SOUL.md | head -20\`

### Step 4: Output the complete agent template

\`\`\`ready_for_review
{
  "type": "ready_for_review",
  "system_name": "kebab-case-agent-name",
  "content": "Research summary, skills built, design rationale.",

  "soul_content": "Full SOUL.md content you wrote above — copy it here as a string.",

  "skill_graph": [
    {
      "skill_id": "matches-skill-directory",
      "name": "Human Readable Name",
      "description": "What this skill does",
      "source": "custom",
      "depends_on": [],
      "skill_md": "Full SKILL.md content for this skill"
    }
  ],

  "sub_agents": [
    {
      "agent_id": "sub-agent-name",
      "name": "Sub-Agent Display Name",
      "description": "What this sub-agent handles",
      "skills": ["skill-ids-it-uses"],
      "trigger": "delegated"
    }
  ],

  "workflow": {
    "name": "main-workflow",
    "description": "End-to-end execution flow",
    "steps": [
      { "id": "step-1", "action": "execute", "skill": "skill-id", "wait_for": [] },
      { "id": "step-2", "action": "execute", "skill": "skill-id", "wait_for": ["step-1"] },
      { "id": "step-3", "action": "delegate", "agent": "sub-agent-id", "wait_for": ["step-2"] }
    ]
  },

  "cron_jobs": [
    {
      "name": "daily-run",
      "schedule": "0 9 * * 1-5",
      "message": "Run the daily workflow",
      "description": "Weekdays at 9am"
    }
  ],

  "triggers": [
    { "id": "schedule-trigger", "kind": "schedule", "title": "Daily at 9am", "schedule": "0 9 * * 1-5", "description": "Run the main workflow daily" },
    { "id": "webhook-trigger", "kind": "webhook", "title": "On new event", "description": "Triggered by external webhook" },
    { "id": "manual-trigger", "kind": "manual", "title": "Manual run", "description": "Run on demand" }
  ],

  "tool_connections": [
    { "tool_id": "github", "name": "GitHub", "description": "Repository access", "required_env": ["GITHUB_TOKEN"] },
    { "tool_id": "slack", "name": "Slack", "description": "Channel messaging", "required_env": ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"] }
  ],

  "agent_metadata": {
    "agent_name": "Human Readable Agent Name",
    "tone": "professional",
    "cron_expression": "0 9 * * 1-5",
    "schedule_description": "Weekdays at 9am",
    "primary_users": "target audience"
  },

  "requirements": {
    "schedule": "weekdays at 9am",
    "required_env_vars": ["ALL_ENV_VARS_NEEDED"],
    "data_sources": ["APIs from research"],
    "outputs": ["What the agent produces"]
  }
}
\`\`\`

## Progress Tracking — CRITICAL

The \`<plan>\` and \`<task_update>\` tags render as a live progress tracker in the UI.
You MUST output task updates **in your text response** (NOT inside tool call arguments).
After completing each step, output the update DIRECTLY as text before moving to the next step:

\`<task_update index="0" status="done"/>\`
Step 1 complete — {brief summary}.

\`<task_update index="1" status="done"/>\`
Step 2 complete — {brief summary}.

...and so on. This is how the user sees your progress. If updates are inside tool calls, they are INVISIBLE to the user.

## Rules
- Execute ALL steps in one turn. Never stop after the plan.
- ALWAYS output \`<task_update>\` tags in your TEXT response after finishing each step — NEVER inside tool call arguments.
- ALWAYS write SOUL.md and SKILL.md files in the workspace before outputting the design.
- ALWAYS include \`soul_content\` and \`skill_md\` in the JSON so the template is self-contained.
- ALWAYS search ClawHub before creating custom skills.
- Sub-agents are optional — only create them if the agent needs specialized delegation.
- Cron expressions: minute hour day-of-month month day-of-week (e.g., \`0 9 * * 1-5\` = weekdays 9am).
- The JSON MUST be valid. No trailing commas, no comments.
- \`source\`: "custom" (you built it), "existing" (from ClawHub), "native_tool" (built-in browser/terminal/file).
- This template should be reusable — another user should be able to deploy the same agent from this config.
[/INSTRUCTION]

`;

// ─── Workflow normalization ─────────────────────────────────────────────────

function normalizeWorkflow(
  rawWorkflow: WorkflowDefinition | { steps: string[] } | null | undefined,
  nodes: SkillGraphNode[],
  systemName: string | null,
): WorkflowDefinition {
  if (!rawWorkflow) {
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

  const rawSteps = (rawWorkflow as { steps: unknown }).steps;
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

  return rawWorkflow as WorkflowDefinition;
}

// ─── Rule extraction ────────────────────────────────────────────────────────

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

// ─── Emit wizard directives for any response that carries metadata ────────

function emitMetadataDirectives(
  response: ArchitectResponse,
  observer: { next: (event: BaseEvent) => void },
): void {
  const directives = parseWizardDirectives(response);
  // Filter out set_phase — we only auto-advance for ready_for_review
  for (const directive of directives) {
    if (directive.type === "set_phase") continue;
    switch (directive.type) {
      case "update_fields":
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_UPDATE_FIELDS,
          value: {
            name: directive.name,
            description: directive.description ?? response.content,
            systemName: directive.systemName,
          },
        } as BaseEvent);
        break;
      case "set_skills":
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_SET_SKILLS,
          value: { nodes: directive.nodes, workflow: directive.workflow, rules: directive.rules, skillIds: directive.skillIds },
        } as BaseEvent);
        break;
      case "connect_tools":
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_CONNECT_TOOLS,
          value: {
            toolIds: directive.toolIds,
            toolConnections: directive.toolConnections,
          },
        } as BaseEvent);
        break;
      case "set_triggers":
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_SET_TRIGGERS,
          value: {
            triggerIds: directive.triggerIds,
            triggers: directive.triggers,
          },
        } as BaseEvent);
        break;
      case "set_rules":
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_SET_RULES,
          value: { rules: directive.rules },
        } as BaseEvent);
        break;
    }
  }
}

// ─── Extract agent name/description from conversational text ────────────────

function extractNameFromContent(content: string): string | null {
  // Match patterns like:
  //   "I'll call it <Name>"
  //   "Let's name it <Name>"
  //   "Agent name: <Name>"
  //   "**Name:** <Name>"
  //   "Name: <Name>"
  const patterns = [
    /(?:(?:I'll|let's|we'll|I will|let us)\s+(?:call|name)\s+(?:it|this|the agent|your agent)\s+)[""]?([A-Z][A-Za-z0-9 _-]{2,40})[""]?/i,
    /\*?\*?(?:Agent\s+)?Name\*?\*?\s*[:：]\s*[""]?([A-Z][A-Za-z0-9 _-]{2,40})[""]?/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractDescriptionFromContent(content: string): string | null {
  // Match patterns like:
  //   "Description: <text>"
  //   "**Description:** <text>"
  //   "Purpose: <text>"
  const patterns = [
    /\*?\*?(?:Description|Purpose)\*?\*?\s*[:：]\s*(.{10,200}?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract an agent name + description from the user's own chat message.
 * E.g. "Build an HR onboarding agent that sends welcome messages via Telegram"
 * → { name: "HR Onboarding Agent", description: "sends welcome messages via Telegram" }
 */
function extractAgentNameFromUserMessage(text: string): { name: string; description: string } | null {
  // Pattern 1: "Build a/an <X> agent/bot/scheduler/monitor/tracker/... that <description>"
  const buildMatch = text.match(
    /(?:build|create|make|design|set up)\s+(?:a|an|me a|me an)\s+(.{3,60}?)\s+(?:that|which|to|for)\s+(.{10,200})/i,
  );
  if (buildMatch) {
    let rawName = buildMatch[1].trim();
    const description = buildMatch[2].trim().replace(/\.$/, "");
    // If name doesn't already end with "agent/bot", append "Agent"
    if (!/(?:agent|bot)$/i.test(rawName)) {
      rawName += " agent";
    }
    const name = rawName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return { name, description };
  }

  // Pattern 2: "I need/want a/an <X> that..."
  const needMatch = text.match(
    /(?:i need|i want|i'd like)\s+(?:a|an)\s+(.{3,60}?)\s+(?:that|which|to|for)\s+(.{10,200})/i,
  );
  if (needMatch) {
    let rawName = needMatch[1].trim();
    if (!/(?:agent|bot)$/i.test(rawName)) {
      rawName += " agent";
    }
    const name = rawName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    const description = needMatch[2].trim().replace(/\.$/, "");
    return { name, description };
  }

  return null;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface BuilderAgentConfig {
  sessionId: string;
  mode?: OpenClawRequestMode;
  onSessionRotate?: (newSessionId: string) => void;
  /** Route chat through a specific forge sandbox's gateway instead of the shared one. */
  forgeSandboxId?: string;
  /** @deprecated No longer used — intermediate events drive progressive updates. */
  stageDelayMs?: number;
}

// ─── Agent ──────────────────────────────────────────────────────────────────

export class BuilderAgent extends AbstractAgent {
  private currentSessionId: string;
  private mode: OpenClawRequestMode;
  private onSessionRotate?: (newSessionId: string) => void;
  private forgeSandboxId?: string;
  private isFirstMessage = true;
  readonly stageDelayMs: number;

  constructor(config: BuilderAgentConfig) {
    super();
    this.currentSessionId = config.sessionId;
    this.mode = config.mode ?? "build";
    this.onSessionRotate = config.onSessionRotate;
    this.forgeSandboxId = config.forgeSandboxId;
    this.stageDelayMs = config.stageDelayMs ?? 800;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      this.runStream(input, observer).catch((err) => {
        observer.error(err);
      });
    });
  }

  private async runStream(
    input: RunAgentInput,
    observer: { next: (event: BaseEvent) => void; complete: () => void; error: (err: unknown) => void },
  ): Promise<void> {
    const threadId = input.threadId;
    const runId = input.runId;

    observer.next({
      type: EventType.RUN_STARTED,
      threadId,
      runId,
    } as BaseEvent);

    observer.next({
      type: EventType.STEP_STARTED,
      stepName: "connecting",
    } as BaseEvent);

    // Get user message from input
    const userMessage = input.messages[input.messages.length - 1];
    let message = userMessage?.content ?? "";
    if (typeof message !== "string") message = "";

    // Select system instruction based on the current development stage.
    // Each stage gets a dedicated instruction that constrains the architect.
    const wizardState = input.forwardedProps?.wizardState;
    const devStage =
      (wizardState as { devStage?: string } | undefined)?.devStage ??
      (this.isFirstMessage ? "think" : undefined);
    let systemInstruction: string | undefined;

    if (devStage === "think") {
      systemInstruction = THINK_SYSTEM_INSTRUCTION;
    } else if (devStage === "plan") {
      systemInstruction = PLAN_SYSTEM_INSTRUCTION;
    } else if (devStage === "build") {
      systemInstruction = BUILDER_SYSTEM_INSTRUCTION;
    } else if (devStage === "review" || devStage === "test" || devStage === "ship" || devStage === "reflect") {
      systemInstruction = REFINE_SYSTEM_INSTRUCTION;
    } else if (this.isFirstMessage) {
      systemInstruction = THINK_SYSTEM_INSTRUCTION;
    }
    // Subsequent messages without a devStage don't override the instruction
    // (the architect remembers its system instruction from the session)

    if (this.isFirstMessage) {
      this.isFirstMessage = false;
    }

    // Inject wizard state context if provided (co-pilot mode)
    if (wizardState) {
      const ctx = buildWizardStateContext(wizardState);
      message = ctx + "\n\n" + message;
    }

    const messageId = `msg-${runId}`;
    const isCopilot = this.mode === "copilot";
    let hasStreamedDeltas = false;
    const closeCopilotTextMessage = () => {
      if (!isCopilot) {
        return;
      }

      observer.next({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
    };

    try {
      // In copilot mode, stream text deltas incrementally so event middleware
      // extractors (browser, code, task plan) can process them in real-time.
      if (isCopilot) {
        observer.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" } as BaseEvent);
      }

      // ── Immediate identity extraction + Think stage activation ──
      if (isCopilot && devStage === "think") {
        // Signal Think stage is generating (so UI shows "Preparing..." immediately)
        observer.next({
          type: EventType.CUSTOM,
          name: "think_status",
          value: { status: "generating" },
        } as BaseEvent);

        // Extract name from user message
        const userText = userMessage?.content ?? "";
        if (typeof userText === "string" && userText.length > 10) {
          const extracted = extractAgentNameFromUserMessage(userText);
          if (extracted) {
            observer.next({
              type: EventType.CUSTOM,
              name: CustomEventName.WIZARD_UPDATE_FIELDS,
              value: { name: extracted.name, description: extracted.description, systemName: extracted.name },
            } as BaseEvent);
          }
        }
      }

      // Track intermediate wizard updates emitted during streaming
      // so the final ready_for_review handler knows what was already sent.
      const intermediateState = {
        identityEmitted: false,
        skillsPhaseEmitted: false,
        toolsPhaseEmitted: false,
        triggersPhaseEmitted: false,
        channelsPhaseEmitted: false,
        discoveredSkills: [] as Array<{ skillId: string; name: string; description: string }>,
        toolHints: [] as string[],
        triggerHints: [] as string[],
        channelHints: [] as string[],
      };

      const emitPhaseFromIntermediate = (phase: string) => {
        observer.next({
          type: EventType.CUSTOM,
          name: CustomEventName.WIZARD_SET_PHASE,
          value: { phase },
        } as BaseEvent);
      };

      const streamCallbacks = {
        onDelta: isCopilot ? (delta: string) => {
          hasStreamedDeltas = true;
          observer.next({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta,
          } as BaseEvent);
        } : undefined,
        onStatus: (phase: string, statusMessage: string) => {
          observer.next({
            type: EventType.STEP_STARTED,
            stepName: phase,
          } as BaseEvent);
        },
        onIntermediate: isCopilot ? (update: IntermediateUpdate) => {
          // Intermediate events emit DATA only — no phase auto-advancement.
          // The user walks through each phase manually after Skills unlocks.
          switch (update.kind) {
            case "identity": {
              if (!intermediateState.identityEmitted) {
                intermediateState.identityEmitted = true;
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.WIZARD_UPDATE_FIELDS,
                  value: {
                    name: update.name as string,
                    description: update.description as string,
                    systemName: update.name as string,
                  },
                } as BaseEvent);
              }
              break;
            }
            case "skill_discovered": {
              intermediateState.discoveredSkills.push({
                skillId: update.skillId as string,
                name: update.name as string,
                description: (update.description as string) || "",
              });
              // Emit partial skill set — no phase change, skills unlock when generation finishes
              observer.next({
                type: EventType.CUSTOM,
                name: CustomEventName.WIZARD_SET_SKILLS,
                value: {
                  nodes: intermediateState.discoveredSkills.map((s) => ({
                    skill_id: s.skillId,
                    name: s.name,
                    description: s.description,
                    status: "generated",
                    source: "custom",
                    depends_on: [],
                  })),
                  workflow: null,
                  rules: [],
                  skillIds: intermediateState.discoveredSkills.map((s) => s.skillId),
                },
              } as BaseEvent);
              break;
            }
            case "tool_hint": {
              const toolId = update.toolId as string;
              if (!intermediateState.toolHints.includes(toolId)) {
                intermediateState.toolHints.push(toolId);
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.WIZARD_CONNECT_TOOLS,
                  value: { toolIds: [...intermediateState.toolHints] },
                } as BaseEvent);
              }
              break;
            }
            case "trigger_hint": {
              const triggerId = update.triggerId as string;
              if (!intermediateState.triggerHints.includes(triggerId)) {
                intermediateState.triggerHints.push(triggerId);
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.WIZARD_SET_TRIGGERS,
                  value: { triggerIds: [...intermediateState.triggerHints] },
                } as BaseEvent);
              }
              break;
            }
            case "channel_hint": {
              const channelId = update.channelId as string;
              if (!intermediateState.channelHints.includes(channelId)) {
                intermediateState.channelHints.push(channelId);
                observer.next({
                  type: EventType.CUSTOM,
                  name: CustomEventName.WIZARD_SET_CHANNELS,
                  value: { channelIds: [...intermediateState.channelHints] },
                } as BaseEvent);
              }
              break;
            }
          }
        } : undefined,
        // Forward workspace/build events from the WebSocket gateway as AG-UI CUSTOM events.
        // These are dispatched to event-consumer-map.ts for workspace refresh, build progress, etc.
        onCustomEvent: (name: string, data: unknown) => {
          observer.next({
            type: EventType.CUSTOM,
            name,
            value: data,
          } as BaseEvent);
        },
      };

      // All paths now use WebSocket via sendToArchitectStreaming.
      // The route handler resolves forge sandbox gateway credentials when
      // forgeSandboxId is present, giving full event support (tool execution,
      // lifecycle events, file writes) for both forge and shared sandboxes.
      const wsMessage = systemInstruction ? systemInstruction + message : message;
      const response: ArchitectResponse = await sendToArchitectStreaming(
        this.currentSessionId,
        wsMessage,
        streamCallbacks,
        {
          mode: this.mode,
          forgeSandboxId: this.forgeSandboxId ?? undefined,
          soulOverride: systemInstruction ?? undefined,
          agentId: this.agentId ?? undefined,
        },
      );

      observer.next({
        type: EventType.STEP_FINISHED,
        stepName: "connecting",
      } as BaseEvent);

      // Map ArchitectResponse to AG-UI events
      // ── Process response through the event registry ──
      // Pure function: ArchitectResponse → BaseEvent[]
      // All response type handling is in event-registry.ts (testable, traceable)
      const eventContext: EventContext = {
        messageId,
        isCopilot,
        hasStreamedDeltas,
        threadId,
        runId,
      };

      const events = processResponse(response, eventContext);

      // Check for RUN_ERROR (error handler returns early)
      const errorEvent = events.find((e) => (e as Record<string, string>).type === EventType.RUN_ERROR);
      if (errorEvent) {
        closeCopilotTextMessage();
        observer.next(errorEvent);
        observer.complete();
        return;
      }

      // Emit all events to the observable
      for (const event of events) {
        observer.next(event);
      }

      // Close copilot text message if needed
      if (isCopilot && hasStreamedDeltas) {
        closeCopilotTextMessage();
      }

      observer.next({
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
      } as BaseEvent);
      observer.complete();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      // Rotate session on error
      const { v4: uuidv4 } = await import("uuid");
      this.currentSessionId = uuidv4();
      this.onSessionRotate?.(this.currentSessionId);

      observer.next({
        type: EventType.RUN_ERROR,
        message: `Unable to reach the architect agent. Please ensure the OpenClaw gateway is running.\n\nError: ${errorMsg}`,
      } as BaseEvent);
      observer.complete();
    }
  }
}
