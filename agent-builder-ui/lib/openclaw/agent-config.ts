import type { SavedAgent } from "@/hooks/use-agents-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ConfigApplyStep {
  kind: "soul" | "skill" | "cron";
  target: string;
  ok: boolean;
  message: string;
}

export interface PushAgentConfigResult {
  ok: boolean;
  applied: boolean;
  detail: string | null;
  steps: ConfigApplyStep[];
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
      skills:
        agent.skillGraph?.map((n) => ({
          skill_id: n.skill_id,
          name: n.name,
          description: n.description || n.name,
        })) ?? [],
      cron_jobs: buildCronJobs(agent),
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

  return {
    ok,
    applied: data?.applied === true,
    detail: ok ? null : typeof data?.detail === "string" ? data.detail : "Agent config apply failed",
    steps,
  };
}
