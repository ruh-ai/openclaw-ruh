/**
 * plan-formatter.ts — Format discovery documents and architecture plans
 * as readable markdown for workspace persistence.
 */

import type { ApiEndpoint, ArchitecturePlan, DashboardPageComponent, DiscoveryDocuments } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean);
}

function slugifyValue(value: string, fallback: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function integrationMethod(value: unknown): "mcp" | "api" | "cli" {
  const method = asString(value, "api").toLowerCase();
  return method === "mcp" || method === "cli" ? method : "api";
}

function triggerType(value: unknown): "cron" | "webhook" | "manual" {
  const type = asString(value, "manual").toLowerCase();
  return type === "cron" || type === "webhook" ? type : "manual";
}

function dashboardComponentType(value: string): DashboardPageComponent["type"] {
  const lower = value.toLowerCase();
  if (lower.includes("metric") || lower.includes("card") || lower.includes("kpi")) return "metric-cards";
  if (lower.includes("activity") || lower.includes("feed") || lower.includes("log")) return "activity-feed";
  if (lower.includes("bar")) return "bar-chart";
  if (lower.includes("pie")) return "pie-chart";
  if (lower.includes("line") || lower.includes("trend") || lower.includes("chart")) return "line-chart";
  if (lower.includes("empty")) return "empty-state";
  if (lower.includes("status")) return "status-badge";
  return "data-table";
}

/**
 * Normalize a raw plan JSON into a safe ArchitecturePlan with all required fields.
 * Fills missing arrays with [] and missing objects with null/defaults.
 */
export function normalizePlan(raw: Record<string, unknown>): ArchitecturePlan {
  const apiEndpoints = asArray(raw.apiEndpoints).map((rawEndpoint, index) => {
    if (typeof rawEndpoint === "string") {
      const path = rawEndpoint.startsWith("/") ? rawEndpoint : `/api/${slugifyValue(rawEndpoint, `endpoint-${index + 1}`)}`;
      return { method: "GET" as const, path, description: rawEndpoint };
    }
    const endpoint = asRecord(rawEndpoint);
    const purpose = asString(endpoint.purpose);
    const description = asString(endpoint.description, purpose);
    const label = description || asString(endpoint.name, `endpoint-${index + 1}`);
    let path = asString(endpoint.path, `/api/${slugifyValue(label, `endpoint-${index + 1}`)}`);
    if (!path.startsWith("/")) path = `/${path}`;
    const method = asString(endpoint.method, "GET").toUpperCase();
    return {
      method: (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET") as ApiEndpoint["method"],
      path,
      description: description || `${method} ${path}`,
      query: asString(endpoint.query) || undefined,
      responseShape: asString(endpoint.responseShape) || undefined,
    };
  });
  const dashboardDataSource = apiEndpoints[0]?.path ?? "/api/status";

  const skills = asArray(raw.skills).map((rawSkill, index) => {
    if (typeof rawSkill === "string") {
      const name = rawSkill.trim() || `Skill ${index + 1}`;
      return {
        id: slugifyValue(name, `skill-${index + 1}`),
        name,
        description: name,
        dependencies: [],
        envVars: [],
      };
    }
    const skill = asRecord(rawSkill);
    const name = asString(skill.name, asString(skill.id, `Skill ${index + 1}`));
    const toolType = integrationMethod(skill.toolType ?? skill.tool_type);
    return {
      id: asString(skill.id, slugifyValue(name, `skill-${index + 1}`)),
      name,
      description: asString(skill.description, name),
      dependencies: asStringArray(skill.dependencies ?? skill.depends_on),
      envVars: asStringArray(skill.envVars ?? skill.requires_env),
      externalApi: asString(skill.externalApi ?? skill.external_api) || undefined,
      toolType,
      skillMd: asString(skill.skillMd ?? skill.skill_md) || undefined,
    };
  });

  const workflow = asRecord(raw.workflow);
  const workflowSteps = asArray(workflow.steps).map((rawStep) => {
    if (typeof rawStep === "string") return { skillId: rawStep, parallel: false };
    const step = asRecord(rawStep);
    return {
      skillId: asString(step.skillId ?? step.skill ?? step.id),
      parallel: Boolean(step.parallel),
    };
  }).filter((step) => step.skillId);

  const dataSchemaRecord = asRecord(raw.dataSchema);
  const dataSchemaTables = asArray(dataSchemaRecord.tables).map((rawTable, tableIndex) => {
    const table = asRecord(rawTable);
    const name = asString(table.name, `table_${tableIndex + 1}`);
    return {
      name,
      description: asString(table.description, name),
      columns: asArray(table.columns).map((rawColumn, columnIndex) => {
        if (typeof rawColumn === "string") {
          return { name: rawColumn.trim() || `column_${columnIndex + 1}`, type: "text" };
        }
        const column = asRecord(rawColumn);
        return {
          name: asString(column.name, `column_${columnIndex + 1}`),
          type: asString(column.type, "text"),
          description: asString(column.description) || undefined,
        };
      }),
      indexes: asStringArray(table.indexes),
    };
  });

  return {
    skills,
    workflow: { steps: workflowSteps },
    integrations: asArray(raw.integrations).map((rawIntegration, index) => {
      if (typeof rawIntegration === "string") {
        return {
          toolId: slugifyValue(rawIntegration, `integration-${index + 1}`),
          name: rawIntegration,
          method: "api" as const,
          envVars: [],
        };
      }
      const integration = asRecord(rawIntegration);
      const name = asString(integration.name ?? integration.toolId, `integration-${index + 1}`);
      return {
        toolId: asString(integration.toolId, slugifyValue(name, `integration-${index + 1}`)),
        name,
        method: integrationMethod(integration.method),
        envVars: asStringArray(integration.envVars ?? integration.requires_env),
      };
    }),
    triggers: asArray(raw.triggers).map((rawTrigger, index) => {
      if (typeof rawTrigger === "string") {
        return { id: slugifyValue(rawTrigger, `trigger-${index + 1}`), type: "manual" as const, config: "", description: rawTrigger };
      }
      const trigger = asRecord(rawTrigger);
      const description = asString(trigger.description ?? trigger.name, `Trigger ${index + 1}`);
      return {
        id: asString(trigger.id, slugifyValue(description, `trigger-${index + 1}`)),
        type: triggerType(trigger.type ?? trigger.kind),
        config: asString(trigger.config ?? trigger.schedule ?? trigger.cron ?? trigger.every),
        description,
      };
    }),
    channels: asStringArray(raw.channels),
    envVars: asArray(raw.envVars).map((rawEnv, index) => {
      if (typeof rawEnv === "string") {
        const key = rawEnv.trim() || `VAR_${index + 1}`;
        return { key, label: key, description: key, required: true, inputType: "text" as const, group: "General" };
      }
      const env = asRecord(rawEnv);
      const key = asString(env.key ?? env.name, `VAR_${index + 1}`);
      return {
        key,
        label: asString(env.label, key),
        description: asString(env.description, key),
        required: typeof env.required === "boolean" ? env.required : true,
        inputType: (["text", "boolean", "number", "select"].includes(asString(env.inputType ?? env.type, "text"))
          ? asString(env.inputType ?? env.type, "text")
          : "text") as ArchitecturePlan["envVars"][number]["inputType"],
        defaultValue: asString(env.defaultValue) || undefined,
        example: asString(env.example) || undefined,
        options: asStringArray(env.options),
        group: asString(env.group, "General"),
        populationStrategy: (["user_required", "ai_inferred", "static_default"].includes(asString(env.populationStrategy, "user_required"))
          ? asString(env.populationStrategy, "user_required")
          : "user_required") as ArchitecturePlan["envVars"][number]["populationStrategy"],
      };
    }),
    subAgents: asArray(raw.subAgents).map((rawAgent, index) => {
      if (typeof rawAgent === "string") {
        return {
          id: slugifyValue(rawAgent, `sub-agent-${index + 1}`),
          name: rawAgent,
          description: rawAgent,
          type: "worker" as const,
          skills: [],
          trigger: "",
          autonomy: "requires_approval" as const,
        };
      }
      const agent = asRecord(rawAgent);
      const name = asString(agent.name, `Sub Agent ${index + 1}`);
      return {
        id: asString(agent.id, slugifyValue(name, `sub-agent-${index + 1}`)),
        name,
        description: asString(agent.description, name),
        type: "worker" as const,
        skills: asStringArray(agent.skills),
        trigger: asString(agent.trigger),
        autonomy: "requires_approval" as const,
      };
    }),
    missionControl: (raw.missionControl ?? null) as ArchitecturePlan["missionControl"],
    dataSchema: dataSchemaTables.length > 0 ? { tables: dataSchemaTables } : null,
    apiEndpoints,
    dashboardPages: asArray(raw.dashboardPages).map((rawPage, index) => {
      if (typeof rawPage === "string") {
        return {
          path: `/${slugifyValue(rawPage, `page-${index + 1}`)}`,
          title: rawPage,
          components: [{ type: "data-table" as const, title: rawPage, dataSource: dashboardDataSource }],
        };
      }
      const page = asRecord(rawPage);
      const title = asString(page.title, asString(page.name, `Page ${index + 1}`));
      let path = asString(page.path, `/${slugifyValue(title, `page-${index + 1}`)}`);
      if (!path.startsWith("/")) path = `/${path}`;
      const components = asArray(page.components).map((rawComponent, componentIndex) => {
        if (typeof rawComponent === "string") {
          return { type: dashboardComponentType(rawComponent), title: rawComponent, dataSource: dashboardDataSource };
        }
        const component = asRecord(rawComponent);
        const typeLabel = asString(component.type, `component-${componentIndex + 1}`);
        return {
          type: dashboardComponentType(typeLabel),
          title: asString(component.title, typeLabel),
          dataSource: asString(component.dataSource ?? component.endpoint, dashboardDataSource),
          config: asRecord(component.config),
        };
      });
      return {
        path,
        title,
        description: asString(page.description) || undefined,
        components: components.length > 0
          ? components
          : [{ type: "data-table" as const, title, dataSource: dashboardDataSource }],
      };
    }),
    vectorCollections: asArray(raw.vectorCollections).map((rawCollection, index) => {
      if (typeof rawCollection === "string") {
        return { name: rawCollection, description: rawCollection };
      }
      const collection = asRecord(rawCollection);
      const name = asString(collection.name, `collection-${index + 1}`);
      return { name, description: asString(collection.description, name) };
    }),
    buildDependencies: (raw.buildDependencies ?? []) as ArchitecturePlan["buildDependencies"],
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
