/**
 * plan-formatter.ts — Format discovery documents and architecture plans
 * as readable markdown for workspace persistence.
 */

import type { ArchitecturePlan, DiscoveryDocuments } from "./types";

/**
 * Normalize a raw plan JSON into a safe ArchitecturePlan with all required fields.
 * Fills missing arrays with [] and missing objects with null/defaults.
 */
export function normalizePlan(raw: Record<string, unknown>): ArchitecturePlan {
  return {
    skills: (raw.skills ?? []) as ArchitecturePlan["skills"],
    workflow: (raw.workflow ?? { steps: [] }) as ArchitecturePlan["workflow"],
    integrations: (raw.integrations ?? []) as ArchitecturePlan["integrations"],
    triggers: (raw.triggers ?? []) as ArchitecturePlan["triggers"],
    channels: (raw.channels ?? []) as ArchitecturePlan["channels"],
    envVars: (raw.envVars ?? []) as ArchitecturePlan["envVars"],
    subAgents: (raw.subAgents ?? []) as ArchitecturePlan["subAgents"],
    missionControl: (raw.missionControl ?? null) as ArchitecturePlan["missionControl"],
    dataSchema: (raw.dataSchema ?? null) as ArchitecturePlan["dataSchema"],
    apiEndpoints: (raw.apiEndpoints ?? []) as ArchitecturePlan["apiEndpoints"],
    dashboardPages: (raw.dashboardPages ?? []) as ArchitecturePlan["dashboardPages"],
    vectorCollections: (raw.vectorCollections ?? []) as ArchitecturePlan["vectorCollections"],
    ...(raw.soulContent ? { soulContent: raw.soulContent as string } : {}),
  };
}

/**
 * Format a PRD (Product Requirements Document) as markdown.
 */
export function formatPRD(doc: DiscoveryDocuments["prd"]): string {
  const sections = doc.sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join("\n\n---\n\n");
  return `# ${doc.title}\n\n${sections}\n`;
}

/**
 * Format a TRD (Technical Requirements Document) as markdown.
 */
export function formatTRD(doc: DiscoveryDocuments["trd"]): string {
  const sections = doc.sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join("\n\n---\n\n");
  return `# ${doc.title}\n\n${sections}\n`;
}

/**
 * Render a human-readable plan summary from the architecture plan.
 */
export function renderPlanSummary(plan: ArchitecturePlan): string {
  const lines: string[] = [];
  lines.push("# Architecture Plan\n");

  // Skills
  if ((plan.skills ?? []).length > 0) {
    lines.push("## Skills\n");
    lines.push("| Skill | Description | Dependencies | Env Vars |");
    lines.push("|-------|-------------|-------------|----------|");
    for (const s of plan.skills) {
      lines.push(
        `| ${s.name} | ${s.description} | ${s.dependencies.join(", ") || "none"} | ${s.envVars.join(", ") || "none"} |`,
      );
    }
    lines.push("");
  }

  // Workflow
  if (plan.workflow?.steps?.length) {
    lines.push("## Workflow\n");
    for (const step of plan.workflow.steps) {
      const parallel = step.parallel ? " (parallel)" : "";
      lines.push(`- ${step.skillId}${parallel}`);
    }
    lines.push("");
  }

  // Integrations
  if (plan.integrations.length > 0) {
    lines.push("## Integrations\n");
    lines.push("| Tool | Method | Env Vars |");
    lines.push("|------|--------|----------|");
    for (const i of plan.integrations) {
      lines.push(`| ${i.name} | ${i.method} | ${i.envVars.join(", ")} |`);
    }
    lines.push("");
  }

  // Triggers
  if (plan.triggers.length > 0) {
    lines.push("## Triggers\n");
    for (const t of plan.triggers) {
      lines.push(`- **${t.id}** (${t.type}): ${t.description}`);
      if (t.config) lines.push(`  - Config: \`${t.config}\``);
    }
    lines.push("");
  }

  // Environment Variables
  if (plan.envVars.length > 0) {
    lines.push("## Environment Variables\n");
    lines.push("| Key | Description | Required |");
    lines.push("|-----|-------------|----------|");
    for (const e of plan.envVars) {
      lines.push(`| \`${e.key}\` | ${e.description} | ${e.required ? "yes" : "no"} |`);
    }
    lines.push("");
  }

  // Data Schema
  if (plan.dataSchema?.tables?.length) {
    lines.push("## Data Schema\n");
    for (const table of plan.dataSchema.tables) {
      lines.push(`### ${table.name}\n`);
      lines.push(`${table.description}\n`);
      if (table.columns?.length) {
        lines.push("| Column | Type | Nullable | Description |");
        lines.push("|--------|------|----------|-------------|");
        for (const col of table.columns) {
          lines.push(
            `| ${col.name} | ${col.type} | ${"nullable" in col && col.nullable ? "yes" : "no"} | ${col.description ?? ""} |`,
          );
        }
        lines.push("");
      }
    }
  }

  // API Endpoints
  if (plan.apiEndpoints?.length) {
    lines.push("## API Endpoints\n");
    lines.push("| Method | Path | Description |");
    lines.push("|--------|------|-------------|");
    for (const ep of plan.apiEndpoints) {
      lines.push(`| ${ep.method} | \`${ep.path}\` | ${ep.description} |`);
    }
    lines.push("");
  }

  // Dashboard Pages
  if (plan.dashboardPages?.length) {
    lines.push("## Dashboard Pages\n");
    for (const page of plan.dashboardPages) {
      lines.push(`- **${page.title}** (\`${page.path}\`)`);
      if (page.components?.length) {
        for (const c of page.components) {
          lines.push(`  - ${c.type}: ${c.title ?? "component"}`);
        }
      }
    }
    lines.push("");
  }

  // Channels
  if (plan.channels?.length) {
    lines.push("## Channels\n");
    for (const ch of plan.channels) {
      lines.push(`- ${ch}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
