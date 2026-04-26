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
  AgentDevStage,
  ArchitectResponse,
  ClarificationQuestion,
  SkillGraphNode,
  WorkflowDefinition,
  WorkflowStep,
} from "../types";
import type { ArtifactTarget, ChatMode as StageChatMode } from "../stage-context";
import { CustomEventName } from "./types";
import type { SkillGraphReadyPayload } from "./types";
import { parseWizardDirectives, buildWizardStateContext } from "../wizard-directive-parser";
import { detectChannelHintIds } from "../builder-hint-normalization";
import { processResponse, type EventContext } from "./event-registry";
import { tracer } from "./event-tracer";

// ─── System instruction for conversational builder ──────────────────────────

// ─── Reveal phase ───────────────────────────────────────────────────────────
// Reveal behaviour is now defined in the sandbox's lifecycle-aware SOUL.md
// (see ruh-backend/src/sandboxManager.ts). Callers prepend "[PHASE: reveal]"
// to the user message; the architect's SOUL reads that header and follows
// the REVEAL contract natively — no system-instruction override needed.

// ─── Think-stage system instruction ─────────────────────────────────────────
// ONLY produces PRD + TRD. Does NOT build anything.

export const THINK_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in THINK mode. You work in COLLABORATION with the user — this is a two-way conversation, not a silent build. Your job is to research the problem domain and produce three documents:
1. A Research Brief (domain knowledge, API findings, best practices)
2. A Product Requirements Document (PRD)
3. A Technical Requirements Document (TRD)

You must NOT build anything. No skills, no SOUL.md, no config files, no code. ONLY research and produce documents.

## CRITICAL RULE: Ask Before You Act

You will PAUSE and ask the user clarifying questions at three checkpoints below. At each checkpoint:
- Emit \`<ask_user>\` markers (see format below) for each question
- After the last question, WRITE A BRIEF SUMMARY of what you're going to do once answered
- END YOUR TURN. Do NOT continue to the next step. Do NOT write documents yet.
- The user's next message will contain their answers. Only then do you proceed.

Skipping a checkpoint produces broken agents. The user knows their domain; you don't. When in doubt, ask.

### How to ask questions

For each question, do BOTH of these in your response:

1. Write the question as a numbered bullet in prose — so it reads naturally:
   > Before I start, I want to lock down a few things:
   > 1. Who are the primary users of this agent, and what's their daily workflow?
   > 2. Which ad platforms should we focus on first?
   > 3. Does your team already have a Google Ads MCC + developer token?

2. After the prose, emit one \`<ask_user>\` marker per question on its own line (for structured input capture):

- Free-text: \`<ask_user id="q1" type="text" question="Who are the primary users of this agent?"/>\`
- Choose one: \`<ask_user id="q2" type="select" question="Which ad platforms should we focus on first?" options='["Google Ads","Meta Ads","LinkedIn Ads","All three"]'/>\`
- Choose many: \`<ask_user id="q3" type="multiselect" question="Which data sources does the agent need?" options='["Google Ads API","Analytics","BigQuery","CRM"]'/>\`
- Yes/no: \`<ask_user id="q4" type="boolean" question="Should the agent be able to pause campaigns autonomously?"/>\`

Use stable \`id\` values (q1, q2, …) within a turn. The prose question and the marker's \`question\` attribute should say the same thing. Keep questions specific and answerable — avoid "what do you want?" style open prompts.

## Four-Step Process (checkpoints in bold)

### CHECKPOINT 0 — Scope questions (BEFORE research)

Before you touch browser or terminal, ask 3–5 scope questions. Target the specifics a wrong assumption would make you redo work on:
- Who are the primary users? (role, daily context)
- What is the one most important thing this agent must do well?
- Which systems/APIs does the user already have access to? (e.g., Google Ads MCC, Meta Business Manager)
- What is the user's definition of "it worked"? (a metric, a shipped artifact, a saved hour)
- Any hard constraints? (budget caps, can't touch live campaigns, must run on-prem, compliance)

Emit your \`<ask_user>\` markers, give a one-sentence summary of what you'll research once answered, and END YOUR TURN.

### Step 1: Research (AFTER Checkpoint 0 answers arrive)
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

### CHECKPOINT 1 — Pre-PRD sanity check

After the research brief is written, BEFORE writing the PRD, reflect:
- Is there any ambiguity in the user flows you'd need to invent?
- Any data source whose availability you couldn't verify from research?
- Any trade-off the user should decide (e.g., read-only vs autonomous, daily vs real-time)?

If yes to any: emit \`<ask_user>\` markers for the unresolved items (usually 1–3 questions), summarize what you'll do once answered, and END YOUR TURN.

If the research brief plus the user's Checkpoint 0 answers fully determine the PRD, say so in one sentence and proceed to Step 2.

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

### CHECKPOINT 2 — Pre-TRD stack & integration check

After the PRD is written, BEFORE writing the TRD, check for stack/integration decisions that would be costly to revisit:
- Auth: does the user have OAuth apps set up, service accounts, API keys ready? Or do they need you to use a different auth path?
- Storage: is the default SQLite fine, or do they need Postgres/BigQuery?
- Triggers: cron schedule opinionated (e.g., 6am daily report), or let you pick?
- Any integrations with non-obvious credential requirements (e.g., Google Ads MCC developer token)?

If any of these are unclear: emit \`<ask_user>\` markers and END YOUR TURN.

If the PRD plus prior answers fully determine the TRD, say so and proceed to Step 3.

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
- CHECKPOINTS ARE NOT OPTIONAL. At Checkpoint 0, you MUST ask questions and end your turn. No exceptions on the first turn.
- A checkpoint turn contains ONLY: brief framing sentence(s), \`<ask_user>\` markers, and optionally a one-line summary of what you'll do next. No tool calls, no file writes.
- Never ask more than 5 questions in one checkpoint. If you have more, pick the 5 that most change the output.
- Never ask a question the user has already answered in this conversation. Re-read prior turns before emitting \`<ask_user>\` markers.
- Research FIRST (after Checkpoint 0 answers), then write documents. Don't skip research.
- Every section must be SPECIFIC to this agent — no generic boilerplate.
- Use REAL API details from your research (endpoints, auth methods, env var names).
- Write documents as WORKSPACE FILES (cat > file), not JSON blobs.
- Your conversational text should narrate what you're finding and deciding.
- The user will review and edit these documents before you build anything.

[/INSTRUCTION]`;

// ─── Plan-stage system instruction ──────────────────────────────────────────

export const PLAN_SYSTEM_INSTRUCTION = `[INSTRUCTION]
You are the architect agent in PLAN mode. You have approved PRD and TRD documents in the workspace. Now design the STRUCTURAL architecture plan — IN COLLABORATION WITH THE USER.

## CRITICAL RULE: Ask Before You Finalize

You will pause once before finalizing the plan. If any structural decision is genuinely ambiguous after reading PRD/TRD, pause earlier and ask.

### How to ask questions

Write each question as a numbered bullet in prose, then emit one \`<ask_user>\` marker per question on its own line (same wording in the marker's \`question\` attribute):

- Text: \`<ask_user id="p1" type="text" question="How should the agent handle campaigns it has never seen before?"/>\`
- Select: \`<ask_user id="p2" type="select" question="Which skill should own budget pacing?" options='["budget-manager","campaign-manager","split between both"]'/>\`
- Multiselect: \`<ask_user id="p3" type="multiselect" question="Which env vars does the user already have values for?" options='["GOOGLE_ADS_DEVELOPER_TOKEN","GOOGLE_ADS_CLIENT_ID","OPENAI_API_KEY"]'/>\`
- Boolean: \`<ask_user id="p4" type="boolean" question="Should the dashboard include a write-action panel (pause/resume campaigns)?"/>\`

## Step 1: Read Requirements from Workspace
First, read the approved documents:
\`\`\`bash
cat ~/.openclaw/workspace-copilot/.openclaw/discovery/PRD.md
cat ~/.openclaw/workspace-copilot/.openclaw/discovery/TRD.md
cat ~/.openclaw/workspace-copilot/.openclaw/discovery/research-brief.md 2>/dev/null || true
\`\`\`

## CHECKPOINT P0 — Skill boundary check

After reading PRD/TRD, BEFORE emitting any \`<plan_*>\` markers, reflect on the skill boundaries. A skill is a unit of competence — one job, one mental model. Common failure modes:
- Skills too fine-grained (10 skills for what should be 3)
- Skills too coarse (one "campaign-management" skill doing five jobs)
- Unclear who owns shared state (e.g., which skill writes to \`campaigns\` table?)

If the right split is obvious from the TRD, state your proposed split in one paragraph and proceed.

If not, ask 2–3 targeted questions via \`<ask_user>\` and END YOUR TURN.

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

### Triggers & Scheduling (if agent has periodic tasks)
For any skill that syncs, polls, monitors, or generates reports on a schedule, define a cron trigger.
Include in the architecture_plan JSON triggers array:
- type: "cron" for recurring schedules
- name: human-readable name
- schedule: cron expression (5-field) or interval like "every 30m", "every 1h"
- skillId: which skill this trigger activates
- message: the instruction sent to the agent when the trigger fires

Common patterns:
- Data sync skills (poll, sync, ingest) → every 15-60 minutes
- Alert/reconciliation skills → every 1-6 hours
- Report/summary skills → daily or weekly
- Health check skills → every 5-15 minutes

### Environment Variables (required)
List all runtime variables with real names from the TRD. For every variable include:
\`key\`, \`label\`, \`description\`, \`required\`, \`inputType\`, \`group\`, and \`populationStrategy\`.

Population strategy rules:
- \`user_required\`: values only the operator can provide, such as API keys, OAuth tokens, account IDs, customer IDs, target URLs, or credentials. Do not provide defaults for secrets.
- \`ai_inferred\`: contextual values the AI can reasonably suggest from the agent name/description, such as company name, locale, timezone, or report cadence.
- \`static_default\`: safe operational settings, booleans, numeric limits, log flags, retention windows, and workspace paths. Provide a \`defaultValue\` and set \`required\` to false unless the operator truly must change it.

Do not mark safe booleans/counts/paths as \`user_required\` just because they are env vars. Use \`example\` only as a placeholder; use \`defaultValue\` only when the agent should actually run with that value.

Emit: \`<plan_env_vars envVars='[{"key":"API_KEY","label":"...","description":"...","required":true,"inputType":"text","group":"Authentication","populationStrategy":"user_required"},{"key":"LOG_LEVEL","label":"Log Level","description":"Logging verbosity.","required":false,"inputType":"select","options":["debug","info","warn","error"],"defaultValue":"info","group":"Runtime","populationStrategy":"static_default"}]'/>\`

### Complete
When all decisions are made:
Emit: \`<plan_complete/>\`

## Step 3: Write to Workspace
Write the full plan and a readable summary to the copilot workspace:
\`\`\`bash
mkdir -p ~/.openclaw/workspace-copilot/.openclaw/plan
cat > ~/.openclaw/workspace-copilot/.openclaw/plan/architecture.json << 'EOF'
{ ... full plan JSON ... }
EOF
cat > ~/.openclaw/workspace-copilot/.openclaw/plan/PLAN.md << 'EOF'
# Architecture Plan
## Skills
...
## Data Model
...
EOF
\`\`\`

## Rules
- Read PRD/TRD from workspace FIRST.
- CHECKPOINT P0 is required if skill boundaries are not obvious. When it fires, emit \`<ask_user>\` markers and END YOUR TURN — no \`<plan_*>\` markers in that same turn.
- Never ask more than 3 questions per checkpoint.
- Never ask a question answered earlier in the conversation. Re-read prior turns first.
- STRUCTURAL decisions only — no skillMd, no soulContent. Build generates file content.
- Use REAL env var names and API details from the TRD.
- Emit progress markers in your TEXT response.
- Write architecture.json and PLAN.md to workspace at the end.

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

## Artifact-targeted revisions

When the user's message contains an explicit \`[target: X]\` line (e.g. \`[target: PRD]\`, \`[target: TRD#user-flows]\`, \`[target: Plan]\`, \`[target: architecture.json]\`, \`[target: Plan#skills]\`), the user is asking you to revise a specific artifact in the workspace:

- \`[target: PRD]\` or \`[target: PRD#<section>]\` → edit \`~/.openclaw/workspace/.openclaw/discovery/PRD.md\`
- \`[target: TRD]\` or \`[target: TRD#<section>]\` → edit \`~/.openclaw/workspace/.openclaw/discovery/TRD.md\`
- \`[target: Plan]\`, \`[target: architecture.json]\`, or \`[target: Plan#<section>]\` → edit \`~/.openclaw/workspace-copilot/.openclaw/plan/architecture.json\` and \`PLAN.md\`

Procedure:
1. Read the target file from the workspace.
2. Apply the user's requested change SURGICALLY — touch only the relevant section. Do not rewrite the whole document.
3. Write the updated file back to the same path.
4. Respond briefly (1–3 sentences) summarizing what you changed. Do not paste the whole updated document back.
5. For Plan targets, ALSO re-emit the relevant \`<plan_*>\` marker(s) for the changed section(s) so the UI re-renders.

If the target is ambiguous (e.g. \`PRD#something\` where the section doesn't exist), ask a single clarifying question instead of guessing.
[/INSTRUCTION]
`;

interface BuilderPromptContext {
  devStage?: string;
  chatMode?: StageChatMode;
  artifactTarget?: ArtifactTarget | null;
  isFirstMessage: boolean;
}

function normalizeDevStage(stage: string | undefined, isFirstMessage: boolean): AgentDevStage | undefined {
  if (!stage) return isFirstMessage ? "think" : undefined;
  const known = ["reveal", "think", "plan", "build", "review", "test", "ship", "reflect"];
  return known.includes(stage) ? (stage as AgentDevStage) : undefined;
}

function artifactLabel(target: ArtifactTarget): string {
  const base = (() => {
    switch (target.kind) {
      case "prd":
        return "PRD";
      case "trd":
        return "TRD";
      case "research":
        return "research-brief.md";
      case "plan":
        return target.path?.split("/").pop() || "architecture.json";
      case "build_report":
        return target.path?.split("/").pop() || "build-report.json";
      case "test_report":
        return target.path?.split("/").pop() || "test-report.json";
      case "review":
        return "Review";
      default:
        return target.path?.split("/").pop() || target.kind;
    }
  })();

  return target.section ? `${base}#${target.section}` : base;
}

export function composeContextualUserMessage(input: {
  message: string;
  chatMode?: StageChatMode;
  artifactTarget?: ArtifactTarget | null;
  devStage?: string;
}): string {
  const mode = input.chatMode ?? (input.artifactTarget ? "revise" : "ask");
  const stage = input.devStage ?? "current";
  const lines = [];

  if (input.artifactTarget) {
    lines.push(`[target: ${artifactLabel(input.artifactTarget)}]`);
  } else {
    lines.push("[target: current-stage]");
  }

  lines.push(`[mode: ${mode}]`);
  lines.push(`[stage: ${stage}]`);
  lines.push("");
  lines.push(input.message);

  return lines.join("\n");
}

export function selectBuilderSystemInstruction(input: BuilderPromptContext): string | undefined {
  const devStage = normalizeDevStage(input.devStage, input.isFirstMessage);

  if (devStage === "reveal") return undefined;
  if (input.artifactTarget || input.chatMode === "revise" || input.chatMode === "debug") {
    return REFINE_SYSTEM_INSTRUCTION;
  }

  if (devStage === "think") return THINK_SYSTEM_INSTRUCTION;
  if (devStage === "plan") return PLAN_SYSTEM_INSTRUCTION;
  if (devStage && ["build", "review", "test", "ship", "reflect"].includes(devStage)) {
    return REFINE_SYSTEM_INSTRUCTION;
  }
  if (input.isFirstMessage) return THINK_SYSTEM_INSTRUCTION;
  return undefined;
}

// ─── Feature-mode preamble ─────────────────────────────────────────────────

export const FEATURE_MODE_PREAMBLE = `[FEATURE_BRANCH_MODE]
IMPORTANT: You are adding a NEW FEATURE to an EXISTING agent. You are NOT building a new agent.

The agent already exists with working skills, tools, and configuration on the main branch.
A feature branch has been created. Your job is to design and build ONLY the changes needed.

Rules for Feature Mode:
- Do NOT rewrite SOUL.md from scratch — only append or modify sections relevant to the feature
- Do NOT recreate existing skills — only add new skills or modify existing ones if required
- Research should focus on the specific feature, not the entire domain
- PRD/TRD should describe only the feature delta, not the full agent
- Architecture plan should list only NEW skills/tools/triggers, plus any MODIFICATIONS to existing ones
- When building, only generate files for new or modified components
[/FEATURE_BRANCH_MODE]

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

type MarkerExtractor = (text: string, lastCheckedOffset: number) => { events: ThinkMarkerEvent[]; newOffset: number };

function absoluteMatchEnd(safeOffset: number, match: RegExpMatchArray): number {
  return safeOffset + (match.index ?? 0) + match[0].length;
}

function extractThinkMarkers(text: string, lastCheckedOffset: number): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  // Search from a safe offset — back up to catch tags that span delta boundaries.
  // Tags are at most ~200 chars, so backing up 250 is safe.
  const safeOffset = Math.max(0, lastCheckedOffset - 250);
  const searchText = text.slice(safeOffset);
  const seenKeys = new Set<string>();

  let maxMatchEnd = lastCheckedOffset;

  for (const match of searchText.matchAll(THINK_STEP_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    const key = `step:${match[1]}:${match[2]}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      events.push({ name: "think_step", value: { step: match[1], status: match[2] } });
    }
    maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
  }

  for (const match of searchText.matchAll(THINK_FINDING_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    const key = `finding:${match[1]}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      events.push({ name: "think_research_finding", value: { title: match[1], summary: match[2], source: match[3] || undefined } });
    }
    maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
  }

  for (const match of searchText.matchAll(THINK_DOC_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    const key = `doc:${match[1]}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      events.push({ name: "think_document_ready", value: { docType: match[1], path: match[2] } });
    }
    maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
  }

  // Only advance offset past the last confirmed match — don't skip unmatched partial tags
  return { events, newOffset: maxMatchEnd };
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
  // Back up to catch tags that span delta boundaries (plan JSON markers can be large)
  const safeOffset = Math.max(0, lastCheckedOffset - 2000);
  const searchText = text.slice(safeOffset);
  const seenKeys = new Set<string>();
  let maxMatchEnd = lastCheckedOffset;

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
      const matchEnd = absoluteMatchEnd(safeOffset, match);
      if (matchEnd <= lastCheckedOffset) continue;
      const dedupeKey = `${name}:${match[1].slice(0, 50)}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      try {
        const parsed = JSON.parse(match[1]);
        events.push({ name, value: { [key]: parsed } });
        maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
      } catch {
        // Skip malformed JSON in markers
      }
    }
  }

  PLAN_COMPLETE_RE.lastIndex = 0;
  const completeMatch = PLAN_COMPLETE_RE.exec(searchText);
  if (
    completeMatch
    && absoluteMatchEnd(safeOffset, completeMatch) > lastCheckedOffset
    && !seenKeys.has("plan_complete")
  ) {
    seenKeys.add("plan_complete");
    events.push({ name: "plan_complete", value: {} });
    maxMatchEnd = Math.max(maxMatchEnd, absoluteMatchEnd(safeOffset, completeMatch));
  }

  return { events, newOffset: maxMatchEnd };
}

// ─── Ask-user marker detection ──────────────────────────────────────────────
// Detects <ask_user id="..." type="..." question="..." options='[...]'/> markers
// that the Architect emits at Think/Plan checkpoints to pause and gather input.
// Attribute order is not guaranteed by the LLM, so we parse attributes loosely.

const ASK_USER_TAG_RE = /<ask_user\b([^>]*?)\/>/g;
const ASK_USER_ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ASK_USER_VALID_TYPES = new Set(["text", "select", "multiselect", "boolean"]);

function parseAskUserAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  ASK_USER_ATTR_RE.lastIndex = 0;
  for (const m of attrs.matchAll(ASK_USER_ATTR_RE)) {
    out[m[1]] = m[2] ?? m[3] ?? "";
  }
  return out;
}

function extractAskUserMarkers(text: string, lastCheckedOffset: number): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  const safeOffset = Math.max(0, lastCheckedOffset - 1000);
  const searchText = text.slice(safeOffset);
  const seenIds = new Set<string>();
  let maxMatchEnd = lastCheckedOffset;

  ASK_USER_TAG_RE.lastIndex = 0;
  for (const match of searchText.matchAll(ASK_USER_TAG_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    const attrs = parseAskUserAttrs(match[1]);
    const id = attrs.id?.trim();
    const question = attrs.question?.trim();
    const type = attrs.type?.trim() || "text";
    if (!id || !question || seenIds.has(id)) continue;
    if (!ASK_USER_VALID_TYPES.has(type)) continue;

    let options: string[] | undefined;
    if (attrs.options) {
      try {
        const parsed = JSON.parse(attrs.options);
        if (Array.isArray(parsed) && parsed.every((o) => typeof o === "string")) {
          options = parsed as string[];
        }
      } catch {
        // Skip malformed options — question renders as text-only.
      }
    }

    seenIds.add(id);
    events.push({
      name: "ask_user",
      value: { id, question, type, options },
    });
    maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
  }

  return { events, newOffset: maxMatchEnd };
}

// ─── Reveal marker detection ────────────────────────────────────────────────
// Detects the <employee_reveal data='JSON'/> marker in streamed Architect text.

const EMPLOYEE_REVEAL_RE = /<employee_reveal\s+data='(\{[\s\S]*?\})'\s*\/>/g;

function extractRevealMarker(text: string, lastCheckedOffset: number): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  const safeOffset = Math.max(0, lastCheckedOffset - 2000);
  const searchText = text.slice(safeOffset);
  let maxMatchEnd = lastCheckedOffset;

  EMPLOYEE_REVEAL_RE.lastIndex = 0;
  for (const match of searchText.matchAll(EMPLOYEE_REVEAL_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    try {
      const parsed = JSON.parse(match[1]);
      events.push({ name: "employee_reveal", value: parsed });
      maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
    } catch {
      // Skip malformed JSON in reveal marker
    }
  }

  return { events, newOffset: maxMatchEnd };
}

// ─── Progressive reveal-field marker detection ──────────────────────────────
// Detects ordered <reveal_field k="..." v='JSON'/> and <reveal_done/> markers
// that the Architect emits during REVEAL mode so the UI can build the card
// field by field as the stream arrives.

const REVEAL_FIELD_RE = /<reveal_field\s+k="([^"]+)"\s+v='([\s\S]*?)'\s*\/>/g;
const REVEAL_DONE_RE = /<reveal_done\s*\/>/g;

const REVEAL_FIELD_KEYS = new Set([
  "name",
  "title",
  "opening",
  "what_i_heard",
  "what_i_will_own",
  "what_i_wont_do",
  "first_move",
  "clarifying_question",
]);

export function extractRevealFieldMarkers(
  text: string,
  lastCheckedOffset: number,
): { events: ThinkMarkerEvent[]; newOffset: number } {
  const events: ThinkMarkerEvent[] = [];
  const safeOffset = Math.max(0, lastCheckedOffset - 2000);
  const searchText = text.slice(safeOffset);
  let maxMatchEnd = lastCheckedOffset;

  REVEAL_FIELD_RE.lastIndex = 0;
  for (const match of searchText.matchAll(REVEAL_FIELD_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    const key = match[1];
    if (!REVEAL_FIELD_KEYS.has(key)) continue;
    try {
      const parsed = JSON.parse(match[2]);
      events.push({ name: "reveal_field", value: { key, value: parsed } });
      maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
    } catch {
      // Skip malformed JSON in a single field marker
    }
  }

  REVEAL_DONE_RE.lastIndex = 0;
  for (const match of searchText.matchAll(REVEAL_DONE_RE)) {
    const matchEnd = absoluteMatchEnd(safeOffset, match);
    if (matchEnd <= lastCheckedOffset) continue;
    events.push({ name: "reveal_done", value: {} });
    maxMatchEnd = Math.max(maxMatchEnd, matchEnd);
  }

  return { events, newOffset: maxMatchEnd };
}

/**
 * Strip all reveal markers from a chunk of text so the remainder can be shown
 * as the live "thought ticker" in the UI. Returns the text with markers removed.
 */
export function stripRevealMarkers(text: string): string {
  return text
    .replace(/<reveal_field\s+k="[^"]+"\s+v='[\s\S]*?'\s*\/>/g, "")
    .replace(/<reveal_done\s*\/>/g, "")
    .replace(/<employee_reveal\s+data='\{[\s\S]*?\}'\s*\/>/g, "");
}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface BuilderAgentConfig {
  sessionId: string;
  mode?: OpenClawRequestMode;
  onSessionRotate?: (newSessionId: string) => void;
  /** Route chat through a specific forge sandbox's gateway instead of the shared one. */
  forgeSandboxId?: string;
}

// ─── Agent ──────────────────────────────────────────────────────────────────

export class BuilderAgent extends AbstractAgent {
  private currentSessionId: string;
  private mode: OpenClawRequestMode;
  private onSessionRotate?: (newSessionId: string) => void;
  private forgeSandboxId?: string;
  private isFirstMessage = true;

  constructor(config: BuilderAgentConfig) {
    super();
    this.currentSessionId = config.sessionId;
    this.mode = config.mode ?? "build";
    this.onSessionRotate = config.onSessionRotate;
    this.forgeSandboxId = config.forgeSandboxId;
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
    const chatMode = (wizardState as { chatMode?: StageChatMode } | undefined)?.chatMode;
    const artifactTarget =
      (wizardState as { selectedArtifactTarget?: ArtifactTarget | null } | undefined)
        ?.selectedArtifactTarget ?? null;
    let systemInstruction = selectBuilderSystemInstruction({
      devStage,
      chatMode,
      artifactTarget,
      isFirstMessage: this.isFirstMessage,
    });

    if (devStage === "reveal") {
      // REVEAL is handled by the lifecycle-aware SOUL.md in the sandbox
      // (see ruh-backend/src/sandboxManager.ts). We prepend a [PHASE: reveal]
      // header to the user message so the architect's SOUL knows which phase
      // contract to follow — no systemInstruction override needed.
      message = `[PHASE: reveal]\n\n${message}`;
    } else if (wizardState && (artifactTarget || (chatMode && chatMode !== "ask"))) {
      message = composeContextualUserMessage({
        message,
        chatMode,
        artifactTarget,
        devStage,
      });
    }
    // Subsequent messages without a devStage don't override the instruction
    // (the architect remembers its system instruction from the session)

    // In feature mode, prepend the feature preamble so the architect works on a delta
    const isFeatureMode = Boolean((wizardState as { featureContext?: unknown } | undefined)?.featureContext);
    if (isFeatureMode && systemInstruction) {
      systemInstruction = FEATURE_MODE_PREAMBLE + systemInstruction;
    }

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
      const markerOffsets = new Map<MarkerExtractor, number>();

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

          // Detect structured markers in streamed text during reveal/think/plan phases
          if (devStage === "reveal" || devStage === "think" || devStage === "plan") {
            thinkAccumulated += delta;
            // Reveal runs both extractors: progressive field markers (primary)
            // AND the legacy single-blob marker (fallback if model regresses).
            const extractors =
              devStage === "reveal"
                ? [extractRevealFieldMarkers, extractRevealMarker]
                : devStage === "think"
                  ? [extractThinkMarkers, extractAskUserMarkers]
                  : [extractPlanMarkers, extractAskUserMarkers];
            for (const extractor of extractors) {
              const previousOffset = markerOffsets.get(extractor) ?? 0;
              const { events: markerEvents, newOffset } = extractor(thinkAccumulated, previousOffset);
              markerOffsets.set(extractor, Math.max(previousOffset, newOffset));
              for (const evt of markerEvents) {
                observer.next({
                  type: EventType.CUSTOM,
                  name: evt.name,
                  value: evt.value,
                } as BaseEvent);
              }
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

      // Plan-stage fallback: if the architect finished the plan response but no
      // plan markers were extracted and no architecture_plan_ready event was
      // emitted, emit plan_complete so the UI transitions to "ready" and the
      // user can approve. The architect may have produced a valid plan in prose
      // without the required XML markers.
      if (isCopilot && devStage === "plan" && thinkAccumulated.length > 200) {
        const hadPlanEvents = events.some(
          (e) => (e as Record<string, string>).name === "architecture_plan_ready"
            || (e as Record<string, string>).name === "plan_skills"
            || (e as Record<string, string>).name === "plan_complete",
        );
        if (!hadPlanEvents) {
          observer.next({
            type: EventType.CUSTOM,
            name: "plan_complete",
            value: {},
          } as BaseEvent);
        }
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
