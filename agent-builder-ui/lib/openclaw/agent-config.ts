import type { SavedAgent } from "@/hooks/use-agents-store";
import { isRuntimeInputFilled } from "@/lib/agents/runtime-inputs";
import type { ArchitecturePlan, SkillGraphNode, WorkflowDefinition } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ConfigApplyStep {
  kind: "soul" | "skill" | "cron" | "mcp" | "runtime_env";
  target: string;
  ok: boolean;
  message: string;
}

export interface PushAgentConfigResult {
  ok: boolean;
  applied: boolean;
  detail: string | null;
  steps: ConfigApplyStep[];
  webhooks?: Array<{
    triggerId: string;
    title: string;
    url: string;
    secret: string;
    secretLastFour: string;
  }>;
}

function sanitizeConfigSummaryItem(item: string): string | null {
  const trimmed = item.trim();
  if (!trimmed) return null;

  if (/(secret|token|password|api[_ -]?key|client[_ -]?secret|refresh[_ -]?token)/i.test(trimmed)) {
    return null;
  }

  if (/(callback|redirect)[ _-]?url/i.test(trimmed) || /https?:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function describeToolStatus(status: NonNullable<SavedAgent["toolConnections"]>[number]["status"]): string {
  switch (status) {
    case "configured":
      return "configured";
    case "missing_secret":
      return "selected but missing credentials";
    case "unsupported":
      return "manual plan only; not runtime-ready";
    case "available":
    default:
      return "available but not configured";
  }
}

function describeTrigger(trigger: NonNullable<SavedAgent["triggers"]>[number]): string {
  const supportText =
    trigger.status === "supported"
      ? "supported"
      : "manual plan only; not runtime-ready";

  if (trigger.kind === "schedule" && trigger.schedule) {
    return `${supportText}; schedule ${trigger.schedule}`;
  }

  return supportText;
}

function buildConfigContextLines(agent: SavedAgent): string[] {
  const toolLines =
    agent.toolConnections?.map((tool) => {
      const safeSummary = tool.configSummary
        .map(sanitizeConfigSummaryItem)
        .filter((item): item is string => Boolean(item))
        .slice(0, 2);
      const detailSuffix = safeSummary.length > 0 ? ` (${safeSummary.join("; ")})` : "";
      return `- Tool ${tool.name}: ${describeToolStatus(tool.status)}${detailSuffix}`;
    }) ?? [];

  const triggerLines =
    agent.triggers?.map((trigger) => {
      const title = trigger.title || trigger.id;
      return `- Trigger ${title}: ${describeTrigger(trigger)}`;
    }) ?? [];

  const acceptedImprovements =
    agent.improvements?.filter((improvement) => improvement.status === "accepted") ?? [];
  const improvementLines = acceptedImprovements.map(
    (improvement) => `- Accepted improvement: ${improvement.title} — ${improvement.summary}`
  );
  const runtimeInputLines =
    agent.runtimeInputs?.map((input) => {
      const status = isRuntimeInputFilled(input) ? "provided" : "missing";
      return `- Runtime input ${input.label || input.key}: ${status}`;
    }) ?? [];

  if (
    toolLines.length === 0 &&
    triggerLines.length === 0 &&
    improvementLines.length === 0 &&
    runtimeInputLines.length === 0
  ) {
    return [];
  }

  return [
    "## Configured Tools And Triggers",
    ...toolLines,
    ...runtimeInputLines,
    ...triggerLines,
    ...improvementLines,
    "",
  ];
}

export function buildSoulContent(agent: SavedAgent): string {
  const skillList =
    agent.skillGraph && agent.skillGraph.length > 0
      ? agent.skillGraph
      : agent.skills.map((s) => ({ skill_id: s, name: s, description: "" }));

  const lines = [
    `# You are ${agent.name}`,
    "",
    `You are an AI agent named **${agent.name}**. ${agent.description || ""}`,
    "",
    "## Your Mission",
    `You were built to ${agent.description || `run the following skills: ${agent.skills.join(", ")}`}.`,
    "When someone messages you, use your skills to complete the task and respond clearly with what you did.",
    "",
    "## Your Skills",
    ...skillList.map((n) =>
      n.description ? `- **${n.name}**: ${n.description}` : `- **${n.name}**`
    ),
    "",
    ...(agent.agentRules && agent.agentRules.length > 0
      ? ["## Rules", ...agent.agentRules.map((r) => `- ${r}`), ""]
      : []),
    ...buildConfigContextLines(agent),
    "## Workspace Rules",
    "- When a conversation session path is provided, ALWAYS work exclusively within that directory.",
    "- Before creating or writing any files, `cd` to the session directory first.",
    "- Never create output files in the workspace root — always use the session-scoped path.",
    "- If you need shared resources from the workspace root, read them but write outputs to the session directory.",
    "",
    "## Task Planning",
    "When you receive a task that requires multiple steps, start by outputting a structured plan:",
    "",
    "```",
    "<plan>",
    "- [ ] First step description",
    "- [ ] Second step description",
    "- [ ] Third step description",
    "</plan>",
    "```",
    "",
    "As you complete each step, report progress by outputting:",
    '`<task_update index="0" status="done"/>`',
    "",
    "Where `index` is the zero-based step number. This lets the operator see live progress.",
    "For simple single-step tasks, skip the plan and just execute directly.",
    "",
    "## Skill Creation",
    "You have the ability to create, register, and use custom skills.",
    "- Skills are SKILL.md files stored in ~/.openclaw/workspace/skills/<skill-id>/SKILL.md",
    "- Each skill has YAML frontmatter (name, version, description, allowed-tools, user-invocable)",
    "- You can create skills on the fly when a task requires a capability you don't have yet",
    "- After creating a skill, register it in your skills directory so future tasks can discover and reuse it",
    "- Skills should be atomic, focused, and well-documented",
    "- Use the `/skill-creator` skill to scaffold new skills with proper structure",
    "",
    "## Behavior",
    "- Be concise and action-oriented. Execute tasks, don't just describe them.",
    "- When asked what you can do, explain your skills clearly.",
    `- Your trigger: ${agent.triggerLabel}`,
  ];

  return lines.join("\n");
}

export function buildCronJobs(
  agent: SavedAgent
): Array<{ name: string; schedule: string; message: string }> {
  const configuredSchedule = agent.triggers?.find(
    (trigger) => trigger.kind === "schedule" && trigger.status === "supported" && trigger.schedule
  );
  if (configuredSchedule?.schedule) {
    return [
      {
        name: `${agent.name}-schedule`,
        schedule: configuredSchedule.schedule,
        message: `Run ${agent.name} scheduled task`,
      },
    ];
  }

  const scheduleRule = agent.agentRules?.find(
    (r) => r.toLowerCase().includes("cron:") || r.toLowerCase().includes("schedule:")
  );
  const cronMatch = scheduleRule?.match(/\d{1,2}\s+\d{1,2}\s+[\d*]+\s+[\d*]+\s+[\d*]+/);
  if (!cronMatch) return [];
  return [
    {
      name: `${agent.name}-schedule`,
      schedule: cronMatch[0],
      message: `Run ${agent.name} scheduled task`,
    },
  ];
}

export async function pushAgentConfig(
  sandboxId: string,
  agent: SavedAgent
): Promise<PushAgentConfigResult> {
  const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/configure-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_name: agent.name,
      soul_content: buildSoulContent(agent),
      skills: [
        // Always include the skill-creator meta-skill so the agent can build new skills at runtime
        { skill_id: "skill-creator", name: "Skill Creator", description: "Create and register new SKILL.md files for custom agent capabilities." },
        ...(agent.skillGraph?.map((n) => ({
          skill_id: n.skill_id,
          name: n.name,
          description: n.description || n.name,
          // Pass built SKILL.md content so the backend writes it directly instead of generating a stub
          ...(n.skill_md ? { skill_md: n.skill_md } : {}),
        })) ?? []),
      ],
      cron_jobs: buildCronJobs(agent),
      runtime_inputs: agent.runtimeInputs ?? [],
      agent_id: agent.id,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data =
    contentType.includes("application/json")
      ? await res.json()
      : null;

  if (!res.ok) {
    return {
      ok: false,
      applied: false,
      detail:
        typeof data?.detail === "string"
          ? data.detail
          : `Config push failed: ${res.status}`,
      steps: Array.isArray(data?.steps) ? data.steps : [],
    };
  }

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const ok = data?.ok === true && data?.applied === true;
  const webhooks = Array.isArray(data?.webhooks) ? data.webhooks : undefined;

  return {
    ok,
    applied: data?.applied === true,
    detail: ok ? null : typeof data?.detail === "string" ? data.detail : "Agent config apply failed",
    steps,
    ...(webhooks ? { webhooks } : {}),
  };
}

/**
 * Deploy an agent directly from an architecture plan that includes inline content.
 * Skips the architect Build step entirely — writes files via configure-agent in one batch.
 * Returns the push result + generated SkillGraphNodes for the copilot store.
 */
export async function deployFromPlan(
  sandboxId: string,
  agentName: string,
  agentDescription: string,
  plan: ArchitecturePlan,
  agentId?: string,
): Promise<{ result: PushAgentConfigResult; nodes: SkillGraphNode[]; workflow: WorkflowDefinition }> {
  const nodes: SkillGraphNode[] = plan.skills.map((s) => ({
    skill_id: s.id,
    name: s.name,
    description: s.description,
    source: "custom" as const,
    status: "generated" as const,
    depends_on: s.dependencies,
    requires_env: s.envVars,
    tool_type: s.toolType,
    skill_md: s.skillMd,
  }));

  const workflow: WorkflowDefinition = {
    name: "main-workflow",
    description: `${agentName} workflow`,
    steps: plan.workflow.steps.map((s, i) => ({
      id: `step-${i}`,
      action: "execute",
      skill: s.skillId,
      wait_for: i > 0 ? [plan.workflow.steps[i - 1].skillId] : [],
    })),
  };

  const soulContent = plan.soulContent || buildSoulContent({
    id: agentId ?? "new",
    name: agentName,
    avatar: "🤖",
    description: agentDescription,
    skills: nodes.map((n) => n.skill_id),
    skillGraph: nodes,
    agentRules: [],
    triggerLabel: plan.triggers?.[0]?.description ?? "manual",
    sandboxIds: [sandboxId],
    status: "draft",
    createdAt: new Date().toISOString(),
  });

  const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/configure-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_name: agentName,
      soul_content: soulContent,
      skills: [
        { skill_id: "skill-creator", name: "Skill Creator", description: "Create and register new SKILL.md files." },
        ...nodes.map((n) => ({
          skill_id: n.skill_id,
          name: n.name,
          description: n.description || n.name,
          ...(n.skill_md ? { skill_md: n.skill_md } : {}),
        })),
      ],
      cron_jobs: buildCronJobs({
        name: agentName,
        triggers: plan.triggers?.map((t) => ({
          id: t.id,
          title: t.description,
          kind: t.type as "manual" | "schedule" | "webhook",
          status: "supported" as const,
          schedule: t.type === "cron" ? t.config : undefined,
        })),
      } as SavedAgent),
      runtime_inputs: [],
      agent_id: agentId,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    return {
      result: {
        ok: false,
        applied: false,
        detail: typeof data?.detail === "string" ? data.detail : `Deploy failed: ${res.status}`,
        steps: Array.isArray(data?.steps) ? data.steps : [],
      },
      nodes,
      workflow,
    };
  }

  return {
    result: {
      ok: data?.ok === true && data?.applied === true,
      applied: data?.applied === true,
      detail: null,
      steps: Array.isArray(data?.steps) ? data.steps : [],
    },
    nodes,
    workflow,
  };
}
