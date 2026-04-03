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
You are the architect agent in THINK mode. Your job is to research the problem domain and produce three documents:
1. A Research Brief (domain knowledge, API findings, best practices)
2. A Product Requirements Document (PRD)
3. A Technical Requirements Document (TRD)

You must NOT build anything. No skills, no SOUL.md, no config files, no code. ONLY research and produce documents.

## Three-Step Process

### Step 1: Research
Use your browser and terminal tools to research the domain:
- What APIs and services exist? Check official docs for endpoints, auth methods, rate limits, pricing.
- What SDKs or libraries are available?
- What are common patterns and best practices?
- Search ClawHub for existing skills: \`openclaw skills search <domain>\`
- What competitors or similar tools exist?

As you find important information, emit a marker for each finding:
\`<think_research_finding title="Finding Title" summary="One-line summary of what you found" source="URL or source name"/>\`

When research is complete, write the research brief to the workspace:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/.openclaw/discovery
cat > ~/.openclaw/workspace/.openclaw/discovery/research-brief.md << 'EOF'
# Research Brief
## Key Findings
- Finding 1...
- Finding 2...
## APIs & Services
- API name, auth method, rate limits, key endpoints
## Existing Skills
- Any relevant ClawHub skills found
## Risks & Considerations
- Rate limits, costs, complexity
EOF
\`\`\`
Then emit: \`<think_document_ready docType="research_brief" path=".openclaw/discovery/research-brief.md"/>\`

### Step 2: PRD
Using your research findings, write the Product Requirements Document:
\`\`\`bash
cat > ~/.openclaw/workspace/.openclaw/discovery/PRD.md << 'EOF'
# Product Requirements Document

## Problem Statement
What problem does this agent solve? Be specific.

## Target Users
Who will use this agent and how?

## Core Capabilities
List 3-7 specific things this agent must do.

## User Flows
Step-by-step user journeys.

## Channels & Integrations
Which platforms and external services?

## Data Requirements
What data does this agent collect, process, and store?
Be specific: entity types, relationships, volumes, update frequency.

## Dashboard Requirements
What does the end user see on Mission Control?
List pages, metrics, tables, charts. Be specific about what data feeds each component.

## Memory & Context
What does the agent remember across conversations?

## Success Criteria
How do we know it works?
EOF
\`\`\`
Then emit: \`<think_document_ready docType="prd" path=".openclaw/discovery/PRD.md"/>\`

### Step 3: TRD
Using research + PRD, write the Technical Requirements Document:
\`\`\`bash
cat > ~/.openclaw/workspace/.openclaw/discovery/TRD.md << 'EOF'
# Technical Requirements Document

## Architecture Overview
High-level agent design including data flow.

## Skills & Workflow
List specific skill names (kebab-case) and execution flow.

## External APIs & Tools
APIs, MCP tools, CLI tools. Include auth methods, key endpoints, rate limits.

## Database Schema
SQLite tables with columns, types, indexes. Be specific — CREATE TABLE statements.
Think about what the agent INSERTs and what the dashboard SELECTs.

## API Endpoints
Custom endpoints the agent-runtime exposes.
Method, path, response shape, which dashboard component consumes it.

## Dashboard Pages
Mission Control pages. For each: title, URL path, components (metric-cards, data-table, line-chart, bar-chart, pie-chart, activity-feed) with data sources.

## Vector Collections
RAG/memory collections. Name, what gets embedded, when, how it's used.

## Triggers & Scheduling
Cron expressions, webhooks, manual triggers.

## Environment Variables
All required env vars with descriptions and examples.

## Error Handling & Guardrails
Safety rules, rate limits, retry policies.
EOF
\`\`\`
Then emit: \`<think_document_ready docType="trd" path=".openclaw/discovery/TRD.md"/>\`

## Progress Markers

Emit these markers in your TEXT response to drive the UI progress bar:
- \`<think_step step="research" status="started"/>\` — when you begin researching
- \`<think_research_finding title="..." summary="..." source="..."/>\` — for each key finding
- \`<think_step step="research" status="complete"/>\` — when research is done
- \`<think_step step="prd" status="started"/>\` — when writing PRD
- \`<think_step step="prd" status="complete"/>\` — when PRD is written
- \`<think_step step="trd" status="started"/>\` — when writing TRD
- \`<think_step step="trd" status="complete"/>\` — when TRD is written
- \`<think_document_ready docType="..." path="..."/>\` — when each doc is saved to workspace

## Context: What Every Agent Is

Every agent is a full-stack application with:
- A SQLite database for structured data (stores results of its work)
- A vector store for RAG memory (remembers context across conversations)
- Custom API endpoints (exposes data to dashboard and external systems)
- A Mission Control dashboard (end users see what the agent is doing)

Think about: What DATA will this agent store? What do end users NEED TO SEE? What CONTEXT should it remember?

## Rules
- Research FIRST, then write documents. Don't skip research.
- Every section must be SPECIFIC to this agent — no generic boilerplate.
- Use REAL API details from your research (endpoints, auth methods, env var names).
- Write documents as WORKSPACE FILES (cat > file), not JSON blobs.
- Your conversational text should narrate what you're finding and deciding.
- The user will review and edit these documents before you build anything.

## Backward Compatibility

If for any reason you cannot write files to the workspace, you may fall back to outputting the PRD and TRD as a JSON code block in your text (the old format). Use this format:
\`\`\`ready_for_review
{
  "type": "discovery",
  "system_name": "kebab-case-agent-name",
  "content": "Brief summary",
  "prd": { "title": "...", "sections": [{ "heading": "...", "content": "..." }] },
  "trd": { "title": "...", "sections": [{ "heading": "...", "content": "..." }] }
}
\`\`\`
The frontend can parse both formats.
[/INSTRUCTION]`;

// ─── Plan-stage system instruction ──────────────────────────────────────────

export const PLAN_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in PLAN mode. You have approved PRD and TRD documents in the workspace. Now design the STRUCTURAL architecture plan.

## Step 1: Read Requirements from Workspace
First, read the approved documents:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/discovery/PRD.md
cat ~/.openclaw/workspace/.openclaw/discovery/TRD.md
cat ~/.openclaw/workspace/.openclaw/discovery/research-brief.md
\`\`\`

## Step 2: Design Structural Decisions
Design each area. You produce STRUCTURE — what exists and how things relate. The Build phase generates all file content. Explain reasoning conversationally, then emit a progress marker per section.

Do NOT produce inline skillMd or soulContent. The Build phase specialist agents generate all file content.

For each section below, make decisions, explain your reasoning, then emit the marker.

### Skills (required)
Unique kebab-case ID, one per capability, dependencies, toolType (mcp/api/cli), envVars. NO skillMd content.
Emit: \`<plan_skills skills='[{"id":"skill-id","name":"Name","description":"What it does","dependencies":[],"toolType":"api","envVars":["KEY"]}]'/>\`

### Workflow (required)
Execution order, which skills can run in parallel.
Emit: \`<plan_workflow workflow='{"steps":[{"skillId":"skill-id","parallel":false}]}'/>\`

### Data Schema (if agent stores data)
SQLite tables. Every table: id (TEXT PK) + created_at. Real column names.
Emit: \`<plan_data_schema dataSchema='{"tables":[{"name":"tbl","description":"...","columns":[{"name":"id","type":"TEXT PRIMARY KEY","description":"..."}],"indexes":[]}]}'/>\`

### API Endpoints (if dashboard)
Endpoints feeding the dashboard. Method, path, description, response shape.
Emit: \`<plan_api_endpoints apiEndpoints='[{"method":"GET","path":"/api/...","description":"...","responseShape":"{ key: type }"}]'/>\`

### Dashboard Pages (if dashboard)
Overview: MetricCards + ActivityFeed. Data: DataTable. Trends: LineChart.
Emit: \`<plan_dashboard_pages dashboardPages='[{"path":"/overview","title":"...","description":"...","components":[{"type":"metric-cards","title":"...","dataSource":"/api/..."}]}]'/>\`

### Environment Variables (required)
ALL required env vars with real names from the TRD.
Emit: \`<plan_env_vars envVars='[{"key":"API_KEY","label":"...","description":"...","required":true,"inputType":"text","group":"Authentication"}]'/>\`

### Complete
When all decisions are made:
Emit: \`<plan_complete/>\`

## Step 3: Write to Workspace
Write the full plan and a readable summary:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/.openclaw/plan
cat > ~/.openclaw/workspace/.openclaw/plan/architecture.json << 'EOF'
{ ... full plan JSON ... }
EOF
cat > ~/.openclaw/workspace/.openclaw/plan/PLAN.md << 'EOF'
# Architecture Plan
## Skills
...
## Data Model
...
EOF
\`\`\`

## Rules
- Read PRD/TRD from workspace FIRST.
- STRUCTURAL decisions only — no skillMd, no soulContent. Build generates file content.
- Use REAL env var names and API details from the TRD.
- Emit progress markers in your TEXT response.
- Write architecture.json and PLAN.md to workspace at the end.

## Backward Compatibility
If you cannot write files or emit markers, fall back to a JSON code block:

\`\`\`ready_for_review
{
  "type": "architecture_plan",
  "system_name": "kebab-case-agent-name",
  "content": "Brief summary",
  "architecture_plan": { "skills": [...], "workflow": {...}, ... }
}
\`\`\`
The frontend parses both formats.
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

// ─── Build-stage system instruction ─────────────────────────────────────────
// Build is now handled entirely by the v4 orchestrator (build-orchestrator.ts)
// with specialist sub-agents. No monolithic build instruction needed.
// The devStage === "build" branch in runStream falls through to REFINE_SYSTEM_INSTRUCTION
// for any conversational messages during build (e.g., user asking questions).


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

// ─── Think marker detection ─────────────────────────────────────────────────
// Detects structured markers in streamed text and returns AG-UI custom events.
// Markers are XML-like tags: <think_step step="research" status="started"/>

const THINK_STEP_RE = /<think_step\s+step="([^"]+)"\s+status="([^"]+)"\s*\/>/g;
const THINK_FINDING_RE = /<think_research_finding\s+title="([^"]+)"\s+summary="([^"]+)"(?:\s+source="([^"]*)")?\s*\/>/g;
const THINK_DOC_RE = /<think_document_ready\s+docType="([^"]+)"\s+path="([^"]+)"\s*\/>/g;

interface ThinkMarkerEvent {
  name: string;
  value: Record<string, unknown>;
}

function extractThinkMarkers(text: string, lastCheckedOffset: number): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  const searchText = text.slice(lastCheckedOffset);

  for (const match of searchText.matchAll(THINK_STEP_RE)) {
    events.push({
      name: "think_step",
      value: { step: match[1], status: match[2] },
    });
  }

  for (const match of searchText.matchAll(THINK_FINDING_RE)) {
    events.push({
      name: "think_research_finding",
      value: { title: match[1], summary: match[2], source: match[3] || undefined },
    });
  }

  for (const match of searchText.matchAll(THINK_DOC_RE)) {
    events.push({
      name: "think_document_ready",
      value: { docType: match[1], path: match[2] },
    });
  }

  return { events, newOffset: text.length };
}

// ─── Plan marker detection ──────────────────────────────────────────────────

const PLAN_SKILLS_RE = /<plan_skills\s+skills='(\[[\s\S]*?\])'\s*\/>/g;
const PLAN_WORKFLOW_RE = /<plan_workflow\s+workflow='(\{[\s\S]*?\})'\s*\/>/g;
const PLAN_DATA_SCHEMA_RE = /<plan_data_schema\s+dataSchema='(\{[\s\S]*?\})'\s*\/>/g;
const PLAN_API_ENDPOINTS_RE = /<plan_api_endpoints\s+apiEndpoints='(\[[\s\S]*?\])'\s*\/>/g;
const PLAN_DASHBOARD_PAGES_RE = /<plan_dashboard_pages\s+dashboardPages='(\[[\s\S]*?\])'\s*\/>/g;
const PLAN_ENV_VARS_RE = /<plan_env_vars\s+envVars='(\[[\s\S]*?\])'\s*\/>/g;
const PLAN_COMPLETE_RE = /<plan_complete\s*\/>/g;

function extractPlanMarkers(text: string, lastCheckedOffset: number): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  const searchText = text.slice(lastCheckedOffset);

  const jsonMarkers: Array<{ re: RegExp; name: string; key: string }> = [
    { re: PLAN_SKILLS_RE, name: "plan_skills", key: "skills" },
    { re: PLAN_WORKFLOW_RE, name: "plan_workflow", key: "workflow" },
    { re: PLAN_DATA_SCHEMA_RE, name: "plan_data_schema", key: "dataSchema" },
    { re: PLAN_API_ENDPOINTS_RE, name: "plan_api_endpoints", key: "apiEndpoints" },
    { re: PLAN_DASHBOARD_PAGES_RE, name: "plan_dashboard_pages", key: "dashboardPages" },
    { re: PLAN_ENV_VARS_RE, name: "plan_env_vars", key: "envVars" },
  ];

  for (const { re, name, key } of jsonMarkers) {
    re.lastIndex = 0;
    for (const match of searchText.matchAll(re)) {
      try {
        const parsed = JSON.parse(match[1]);
        events.push({ name, value: { [key]: parsed } });
      } catch {
        // Skip malformed JSON in markers
      }
    }
  }

  PLAN_COMPLETE_RE.lastIndex = 0;
  if (PLAN_COMPLETE_RE.test(searchText)) {
    events.push({ name: "plan_complete", value: {} });
  }

  return { events, newOffset: text.length };
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
    } else if (devStage === "build" || devStage === "review" || devStage === "test" || devStage === "ship" || devStage === "reflect") {
      // Build is handled by the v4 orchestrator (specialist sub-agents).
      // Any chat messages during build/review/test/ship/reflect use REFINE.
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

      // ── Think marker detection state ──
      let thinkAccumulated = "";
      let thinkMarkerOffset = 0;

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

          // Detect structured markers in streamed text during think/plan phases
          if (devStage === "think" || devStage === "plan") {
            thinkAccumulated += delta;
            const extractor = devStage === "think" ? extractThinkMarkers : extractPlanMarkers;
            const { events: markerEvents, newOffset } = extractor(thinkAccumulated, thinkMarkerOffset);
            thinkMarkerOffset = newOffset;
            for (const evt of markerEvents) {
              observer.next({
                type: EventType.CUSTOM,
                name: evt.name,
                value: evt.value,
              } as BaseEvent);
            }
          }
        } : undefined,
        onStatus: (phase: string, statusMessage: string) => {
          observer.next({
            type: EventType.STEP_STARTED,
            stepName: phase,
          } as BaseEvent);
          // During Think phase, forward status events as think_activity
          if (isCopilot && devStage === "think") {
            observer.next({
              type: EventType.CUSTOM,
              name: "think_activity",
              value: { type: "status", label: statusMessage || phase },
            } as BaseEvent);
          }
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
          // During Think phase, surface tool usage as think_activity events
          if (isCopilot && devStage === "think") {
            const payload = data as Record<string, unknown>;
            if (name === "tool_start") {
              const toolName = (payload.tool as string) || "tool";
              observer.next({
                type: EventType.CUSTOM,
                name: "think_activity",
                value: { type: "research", label: `Using ${toolName}...` },
              } as BaseEvent);
            } else if (name === "tool_end") {
              const toolName = (payload.tool as string) || "tool";
              observer.next({
                type: EventType.CUSTOM,
                name: "think_activity",
                value: { type: "tool", label: `${toolName} complete` },
              } as BaseEvent);
            }
          }
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
