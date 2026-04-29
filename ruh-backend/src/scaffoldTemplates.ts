/**
 * scaffold-templates.ts — Generate boilerplate files from the ArchitecturePlan.
 *
 * These are deterministic (no LLM). They produce the foundational files
 * that every deployable agent template needs: package.json, Dockerfile,
 * docker-compose.yml, .env.example, tsconfig.json, .gitignore, README.md.
 */

// Inline types — no dependency on frontend modules
interface ArchitecturePlanSkill { id: string; name: string; description: string; dependencies: string[]; envVars: string[]; toolType?: string; externalApi?: string }
interface ArchitecturePlanEnvVar { key: string; label: string; description: string; required: boolean; inputType: string; group: string; example?: string; defaultValue?: string }
interface DashboardPageComponent { type: string; title?: string; dataSource: string; config?: Record<string, unknown> }
interface DashboardPage { path: string; title: string; description?: string; components: DashboardPageComponent[] }
interface DashboardPrototypeWorkflow { id: string; name: string; steps: string[]; requiredActions: string[]; successCriteria: string[] }
interface DashboardPrototypePage { path: string; title: string; purpose: string; supportsWorkflows: string[]; requiredActions: string[]; acceptanceCriteria: string[] }
interface DashboardPrototypeAction { id: string; label: string; description?: string; type: "create" | "run_pipeline" | "approve" | "request_revision" | "resolve_blocker" | "publish" | "other"; target?: "work_item" | "pipeline" | "artifact" | "page" | "external"; pagePath?: string; workflowId?: string; primary?: boolean }
interface DashboardPrototypePipelineStep { id: string; name: string; description?: string; owner?: string; producesArtifacts?: string[]; requiresApproval?: boolean }
interface DashboardPrototypePipeline { name: string; triggerActionId?: string; steps: DashboardPrototypePipelineStep[]; completionCriteria: string[]; failureStates: string[] }
interface DashboardPrototypeArtifact { id: string; name: string; type: string; description?: string; producedByStepId?: string; reviewActions: string[]; acceptanceCriteria: string[] }
interface DashboardPrototypeSpec {
  summary: string;
  primaryUsers: string[];
  workflows: DashboardPrototypeWorkflow[];
  pages: DashboardPrototypePage[];
  actions?: DashboardPrototypeAction[];
  pipeline?: DashboardPrototypePipeline;
  artifacts?: DashboardPrototypeArtifact[];
  emptyState?: string;
  revisionPrompts: string[];
  approvalChecklist: string[];
}
interface ApiEndpoint { method: string; path: string; description: string; query?: string; responseShape?: string }
interface DataSchema { tables: Array<{ name: string; columns: Array<{ name: string; type?: string; description?: string }>; indexes?: Array<{ columns: string[] }> }> }

export interface ArchitecturePlan {
  skills: ArchitecturePlanSkill[];
  workflow: { steps: Array<{ skillId: string; parallel?: boolean }> };
  integrations: Array<{ name: string; method: string }>;
  triggers: Array<{ type: string; name?: string; schedule?: string; every?: string; cron?: string; skillId?: string; message?: string; config?: Record<string, unknown> }>;
  channels: string[];
  envVars: ArchitecturePlanEnvVar[];
  /**
   * Sub-agents emitted by the architect's `<plan_sub_agents>` marker.
   * Empty for single-agent pipelines. The build pipeline (agentBuild.ts)
   * uses `id`, `name`, `description`, and `skills` to decompose the
   * identity + skills specialists per agent. Other fields are carried for
   * future use (e.g., per-agent failure policy in Slice 5).
   */
  subAgents: Array<{
    id: string;
    name: string;
    description: string;
    type: "worker" | "orchestrator" | "monitor" | "specialist";
    skills: string[];
    trigger: string;
    autonomy: "fully_autonomous" | "requires_approval" | "report_only";
  }>;
  missionControl: unknown;
  soulContent?: string;
  dataSchema?: DataSchema | null;
  apiEndpoints?: ApiEndpoint[];
  dashboardPages?: DashboardPage[];
  dashboardPrototype?: DashboardPrototypeSpec;
  vectorCollections?: Array<{ name: string; description: string }>;
  buildDependencies?: Array<{ from: string; to: string }>;
}

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

function normalizeDashboardComponentType(value: string): string {
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

function normalizeDashboardPrototypeWorkflow(raw: unknown): DashboardPrototypeWorkflow | null {
  const workflow = asRecord(raw);
  const id = asString(workflow.id, slugifyValue(asString(workflow.name), "workflow"));
  const name = asString(workflow.name, id);
  if (!id || !name) return null;
  return {
    id,
    name,
    steps: asStringArray(workflow.steps),
    requiredActions: asStringArray(workflow.requiredActions ?? workflow.required_actions),
    successCriteria: asStringArray(workflow.successCriteria ?? workflow.success_criteria),
  };
}

function normalizeDashboardPrototypePage(raw: unknown): DashboardPrototypePage | null {
  const page = asRecord(raw);
  const title = asString(page.title, asString(page.name));
  let path = asString(page.path, title ? `/${slugifyValue(title, "page")}` : "");
  if (path && !path.startsWith("/")) path = `/${path}`;
  const purpose = asString(page.purpose ?? page.description, title);
  if (!path || !title || !purpose) return null;
  return {
    path,
    title,
    purpose,
    supportsWorkflows: asStringArray(page.supportsWorkflows ?? page.supports_workflows),
    requiredActions: asStringArray(page.requiredActions ?? page.required_actions),
    acceptanceCriteria: asStringArray(page.acceptanceCriteria ?? page.acceptance_criteria),
  };
}

function normalizeDashboardPrototypeActionType(value: string): DashboardPrototypeAction["type"] {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (lower.includes("create") || lower.includes("new")) return "create";
  if (lower.includes("pipeline") || lower.includes("run") || lower.includes("start")) return "run_pipeline";
  if (lower.includes("approve")) return "approve";
  if (lower.includes("revision") || lower.includes("revise")) return "request_revision";
  if (lower.includes("blocker") || lower.includes("resolve")) return "resolve_blocker";
  if (lower.includes("publish") || lower.includes("archive")) return "publish";
  return "other";
}

function normalizeDashboardPrototypeActionTarget(value: string): DashboardPrototypeAction["target"] | undefined {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (lower === "work_item" || lower === "estimate" || lower === "project") return "work_item";
  if (lower === "pipeline" || lower === "run") return "pipeline";
  if (lower === "artifact" || lower === "file" || lower === "document") return "artifact";
  if (lower === "page" || lower === "dashboard") return "page";
  if (lower === "external" || lower === "integration") return "external";
  return undefined;
}

function normalizeDashboardPrototypeAction(raw: unknown, index: number): DashboardPrototypeAction | null {
  const action = asRecord(raw);
  const label = asString(action.label ?? action.name, `Action ${index + 1}`);
  const id = asString(action.id, slugifyValue(label, `action-${index + 1}`));
  if (!id || !label) return null;
  return {
    id,
    label,
    description: asString(action.description) || undefined,
    type: normalizeDashboardPrototypeActionType(asString(action.type ?? action.kind, label)),
    target: normalizeDashboardPrototypeActionTarget(asString(action.target)),
    pagePath: asString(action.pagePath ?? action.page_path) || undefined,
    workflowId: asString(action.workflowId ?? action.workflow_id) || undefined,
    primary: typeof action.primary === "boolean" ? action.primary : undefined,
  };
}

function normalizeDashboardPrototypePipelineStep(raw: unknown, index: number): DashboardPrototypePipelineStep | null {
  if (typeof raw === "string") {
    const name = raw.trim();
    return name ? { id: slugifyValue(name, `step-${index + 1}`), name } : null;
  }
  const step = asRecord(raw);
  const name = asString(step.name ?? step.label, `Step ${index + 1}`);
  const id = asString(step.id, slugifyValue(name, `step-${index + 1}`));
  if (!id || !name) return null;
  return {
    id,
    name,
    description: asString(step.description) || undefined,
    owner: asString(step.owner) || undefined,
    producesArtifacts: asStringArray(step.producesArtifacts ?? step.produces_artifacts),
    requiresApproval: typeof step.requiresApproval === "boolean"
      ? step.requiresApproval
      : typeof step.requires_approval === "boolean"
        ? step.requires_approval
        : undefined,
  };
}

function normalizeDashboardPrototypePipeline(raw: unknown): DashboardPrototypePipeline | undefined {
  const pipeline = asRecord(raw);
  if (Object.keys(pipeline).length === 0) return undefined;
  const name = asString(pipeline.name ?? pipeline.title, "Agent Pipeline");
  const steps = asArray(pipeline.steps)
    .map(normalizeDashboardPrototypePipelineStep)
    .filter((step): step is DashboardPrototypePipelineStep => step !== null);
  if (!name || steps.length === 0) return undefined;
  return {
    name,
    triggerActionId: asString(pipeline.triggerActionId ?? pipeline.trigger_action_id) || undefined,
    steps,
    completionCriteria: asStringArray(pipeline.completionCriteria ?? pipeline.completion_criteria),
    failureStates: asStringArray(pipeline.failureStates ?? pipeline.failure_states),
  };
}

function normalizeDashboardPrototypeArtifact(raw: unknown, index: number): DashboardPrototypeArtifact | null {
  const artifact = asRecord(raw);
  const name = asString(artifact.name ?? artifact.title, `Artifact ${index + 1}`);
  const id = asString(artifact.id, slugifyValue(name, `artifact-${index + 1}`));
  if (!id || !name) return null;
  return {
    id,
    name,
    type: asString(artifact.type ?? artifact.kind, "document"),
    description: asString(artifact.description) || undefined,
    producedByStepId: asString(artifact.producedByStepId ?? artifact.produced_by_step_id) || undefined,
    reviewActions: asStringArray(artifact.reviewActions ?? artifact.review_actions),
    acceptanceCriteria: asStringArray(artifact.acceptanceCriteria ?? artifact.acceptance_criteria),
  };
}

function normalizeDashboardPrototype(raw: unknown): DashboardPrototypeSpec | undefined {
  const prototype = asRecord(raw);
  if (Object.keys(prototype).length === 0) return undefined;
  const summary = asString(prototype.summary);
  const workflows = asArray(prototype.workflows)
    .map(normalizeDashboardPrototypeWorkflow)
    .filter((workflow): workflow is DashboardPrototypeWorkflow => workflow !== null);
  const pages = asArray(prototype.pages)
    .map(normalizeDashboardPrototypePage)
    .filter((page): page is DashboardPrototypePage => page !== null);
  if (!summary || workflows.length === 0 || pages.length === 0) return undefined;
  return {
    summary,
    primaryUsers: asStringArray(prototype.primaryUsers ?? prototype.primary_users),
    workflows,
    pages,
    actions: asArray(prototype.actions ?? prototype.dashboardActions ?? prototype.dashboard_actions)
      .map(normalizeDashboardPrototypeAction)
      .filter((action): action is DashboardPrototypeAction => action !== null),
    pipeline: normalizeDashboardPrototypePipeline(prototype.pipeline),
    artifacts: asArray(prototype.artifacts ?? prototype.generatedArtifacts ?? prototype.generated_artifacts)
      .map(normalizeDashboardPrototypeArtifact)
      .filter((artifact): artifact is DashboardPrototypeArtifact => artifact !== null),
    emptyState: asString(prototype.emptyState ?? prototype.empty_state) || undefined,
    revisionPrompts: asStringArray(prototype.revisionPrompts ?? prototype.revision_prompts),
    approvalChecklist: asStringArray(prototype.approvalChecklist ?? prototype.approval_checklist),
  };
}

function normalizeDataSchema(value: unknown): DataSchema | null {
  const schema = asRecord(value);
  const tables = asArray(schema.tables).map((rawTable, tableIndex) => {
    const table = asRecord(rawTable);
    const name = asString(table.name, `table_${tableIndex + 1}`);
    const columns = asArray(table.columns).map((rawColumn, columnIndex) => {
      if (typeof rawColumn === "string") {
        return { name: rawColumn.trim() || `column_${columnIndex + 1}`, type: "text" };
      }
      const column = asRecord(rawColumn);
      return {
        name: asString(column.name, `column_${columnIndex + 1}`),
        type: asString(column.type, "text"),
        description: asString(column.description),
      };
    });
    const indexes = asArray(table.indexes).map((rawIndex) => {
      if (typeof rawIndex === "string") return { columns: [rawIndex] };
      const index = asRecord(rawIndex);
      return { columns: asStringArray(index.columns) };
    }).filter((index) => index.columns.length > 0);
    return { name, columns, indexes };
  });

  return tables.length > 0 ? { tables } : null;
}

// Normalize loose architect output into the stricter scaffold contract.
export function normalizePlan(raw: Record<string, unknown>): ArchitecturePlan {
  const apiEndpoints = asArray(raw.apiEndpoints).map((rawEndpoint, index) => {
    if (typeof rawEndpoint === "string") {
      const path = rawEndpoint.startsWith("/") ? rawEndpoint : `/api/${slugifyValue(rawEndpoint, `endpoint-${index + 1}`)}`;
      return { method: "GET", path, description: rawEndpoint };
    }
    const endpoint = asRecord(rawEndpoint);
    const purpose = asString(endpoint.purpose);
    const description = asString(endpoint.description, purpose);
    const label = description || asString(endpoint.name, `endpoint-${index + 1}`);
    let path = asString(endpoint.path, `/api/${slugifyValue(label, `endpoint-${index + 1}`)}`);
    if (!path.startsWith("/")) path = `/${path}`;
    return {
      method: asString(endpoint.method, "GET").toUpperCase(),
      path,
      description: description || `${asString(endpoint.method, "GET").toUpperCase()} ${path}`,
      query: asString(endpoint.query),
      responseShape: asString(endpoint.responseShape),
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
    return {
      id: asString(skill.id, slugifyValue(name, `skill-${index + 1}`)),
      name,
      description: asString(skill.description, name),
      dependencies: asStringArray(skill.dependencies ?? skill.depends_on),
      envVars: asStringArray(skill.envVars ?? skill.requires_env),
      toolType: asString(skill.toolType ?? skill.tool_type),
      externalApi: asString(skill.externalApi ?? skill.external_api),
    };
  });

  const workflowRecord = asRecord(raw.workflow);
  const workflowSteps = asArray(workflowRecord.steps).map((rawStep) => {
    if (typeof rawStep === "string") return { skillId: rawStep, parallel: false };
    const step = asRecord(rawStep);
    return {
      skillId: asString(step.skillId ?? step.skill ?? step.id),
      parallel: Boolean(step.parallel),
    };
  }).filter((step) => step.skillId);

  return {
    skills,
    workflow: { steps: workflowSteps },
    integrations: asArray(raw.integrations).map((rawIntegration, index) => {
      if (typeof rawIntegration === "string") {
        return { name: rawIntegration, method: "api" };
      }
      const integration = asRecord(rawIntegration);
      return {
        name: asString(integration.name ?? integration.toolId, `integration-${index + 1}`),
        method: asString(integration.method, "api"),
      };
    }),
    triggers: asArray(raw.triggers).map((rawTrigger) => {
      if (typeof rawTrigger === "string") return { type: "manual", name: rawTrigger };
      return rawTrigger as ArchitecturePlan["triggers"][number];
    }),
    channels: asStringArray(raw.channels),
    envVars: asArray(raw.envVars).map((rawEnv, index) => {
      if (typeof rawEnv === "string") {
        const key = rawEnv.trim() || `VAR_${index + 1}`;
        return {
          key,
          label: key,
          description: key,
          required: true,
          inputType: "text",
          group: "General",
        };
      }
      const env = asRecord(rawEnv);
      const key = asString(env.key ?? env.name, `VAR_${index + 1}`);
      return {
        key,
        label: asString(env.label, key),
        description: asString(env.description, key),
        required: typeof env.required === "boolean" ? env.required : true,
        inputType: asString(env.inputType ?? env.type, "text"),
        group: asString(env.group, "General"),
        example: asString(env.example),
        defaultValue: asString(env.defaultValue),
      };
    }),
    subAgents: asArray(raw.subAgents).map((rawAgent, index) => {
      if (typeof rawAgent === "string") {
        return {
          id: slugifyValue(rawAgent, `sub-agent-${index + 1}`),
          name: rawAgent,
          description: rawAgent,
          type: "worker" as const,
          skills: [] as string[],
          trigger: "",
          autonomy: "requires_approval" as const,
        };
      }
      const agent = asRecord(rawAgent);
      const name = asString(agent.name, `Sub Agent ${index + 1}`);
      const rawType = asString(agent.type, "worker");
      const type =
        rawType === "worker" || rawType === "specialist" ||
        rawType === "monitor" || rawType === "orchestrator"
          ? (rawType as "worker" | "specialist" | "monitor" | "orchestrator")
          : ("worker" as const);
      const rawAutonomy = asString(agent.autonomy, "requires_approval");
      const autonomy =
        rawAutonomy === "fully_autonomous" ||
        rawAutonomy === "requires_approval" ||
        rawAutonomy === "report_only"
          ? (rawAutonomy as "fully_autonomous" | "requires_approval" | "report_only")
          : ("requires_approval" as const);
      const skills = asArray(agent.skills)
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim());
      return {
        id: asString(agent.id, slugifyValue(name, `sub-agent-${index + 1}`)),
        name,
        description: asString(agent.description, name),
        type,
        skills,
        trigger: asString(agent.trigger),
        autonomy,
      };
    }),
    missionControl: raw.missionControl ?? null,
    soulContent: raw.soulContent as string | undefined,
    dataSchema: normalizeDataSchema(raw.dataSchema),
    apiEndpoints,
    dashboardPages: asArray(raw.dashboardPages).map((rawPage, index) => {
      if (typeof rawPage === "string") {
        return {
          path: `/${slugifyValue(rawPage, `page-${index + 1}`)}`,
          title: rawPage,
          components: [{ type: "data-table", title: rawPage, dataSource: dashboardDataSource }],
        };
      }
      const page = asRecord(rawPage);
      const title = asString(page.title, asString(page.name, `Page ${index + 1}`));
      let path = asString(page.path, `/${slugifyValue(title, `page-${index + 1}`)}`);
      if (!path.startsWith("/")) path = `/${path}`;
      const components = asArray(page.components).map((rawComponent, componentIndex) => {
        if (typeof rawComponent === "string") {
          return {
            type: normalizeDashboardComponentType(rawComponent),
            title: rawComponent,
            dataSource: dashboardDataSource,
          };
        }
        const component = asRecord(rawComponent);
        const typeLabel = asString(component.type, `component-${componentIndex + 1}`);
        return {
          type: normalizeDashboardComponentType(typeLabel),
          title: asString(component.title, typeLabel),
          dataSource: asString(component.dataSource ?? component.endpoint, dashboardDataSource),
          config: asRecord(component.config),
        };
      });
      return {
        path,
        title,
        description: asString(page.description),
        components: components.length > 0
          ? components
          : [{ type: "data-table", title, dataSource: dashboardDataSource }],
      };
    }),
    dashboardPrototype: normalizeDashboardPrototype(raw.dashboardPrototype),
    vectorCollections: asArray(raw.vectorCollections).map((rawCollection, index) => {
      if (typeof rawCollection === "string") {
        return { name: rawCollection, description: rawCollection };
      }
      const collection = asRecord(rawCollection);
      const name = asString(collection.name, `collection-${index + 1}`);
      return { name, description: asString(collection.description, name) };
    }),
    buildDependencies: (raw.buildDependencies as ArchitecturePlan['buildDependencies']) ?? [],
  };
}

interface ScaffoldFile {
  path: string;
  content: string;
}

// ─── Package.json ────────────────────────────────────────────────────────────

function generatePackageJson(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const deps: Record<string, string> = {
    express: "^4.21.0",
    cors: "^2.8.5",
    dotenv: "^16.5.0",
  };

  // Add DB dependency if schema exists
  if (plan.dataSchema?.tables?.length) {
    deps["pg"] = "^8.16.0";
  }

  // Add dependencies from integrations
  for (const integration of plan.integrations) {
    if (integration.method === "mcp") {
      deps["@modelcontextprotocol/sdk"] = "^1.0.0";
    }
  }

  // Add vector DB dependency
  if (plan.vectorCollections?.length) {
    deps["chromadb"] = "^1.10.0";
  }

  // Add dashboard dependencies
  if (plan.dashboardPages?.length) {
    deps["react"] = "^19.1.0";
    deps["react-dom"] = "^19.1.0";
    deps["react-router-dom"] = "^7.6.0";
  }

  const kebabName = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const pkg = {
    name: kebabName || "openclaw-agent",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch backend/index.ts",
      start: "node --loader tsx backend/index.ts",
      "db:migrate": "tsx db/migrate.ts",
      "db:seed": "tsx db/seed.ts",
      build: "tsc",
      test: "vitest run",
    },
    dependencies: deps,
    devDependencies: {
      typescript: "^5.8.0",
      tsx: "^4.19.0",
      vitest: "^3.2.0",
      "@types/express": "^4.17.0",
      "@types/cors": "^2.8.0",
      "@types/node": "^22.0.0",
      ...(plan.dataSchema?.tables?.length ? { "@types/pg": "^8.11.0" } : {}),
      ...(plan.dashboardPages?.length ? {
        "vite": "^6.3.0",
        "@vitejs/plugin-react": "^4.4.0",
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
      } : {}),
    },
  };

  return {
    path: "package.json",
    content: JSON.stringify(pkg, null, 2) + "\n",
  };
}

// ─── Dockerfile ──────────────────────────────────────────────────────────────

function generateDockerfile(): ScaffoldFile {
  return {
    path: "Dockerfile",
    content: `FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy workspace
COPY . .

# Runtime
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--loader", "tsx", "backend/index.ts"]
`,
  };
}

// ─── Docker Compose ──────────────────────────────────────────────────────────

function generateDockerCompose(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const kebabName = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;

  let content = `version: "3.8"

services:
  ${kebabName}:
    build: .
    ports:
      - "8080:8080"
    env_file: .env
`;

  if (hasDb) {
    content += `    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://agent:agent@postgres:5432/agent

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
      POSTGRES_DB: agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
`;
  }

  return { path: "docker-compose.yml", content };
}

// ─── .env.example ────────────────────────────────────────────────────────────

function generateEnvExample(plan: ArchitecturePlan): ScaffoldFile {
  const lines = ["# Environment variables for this agent", "# Copy to .env and fill in values", ""];

  if (plan.dataSchema?.tables?.length) {
    lines.push("# Database");
    lines.push("DATABASE_URL=postgresql://agent:agent@localhost:5432/agent");
    lines.push("");
  }

  if (plan.envVars.length > 0) {
    lines.push("# Agent credentials");
    for (const env of plan.envVars) {
      if (env.description) lines.push(`# ${env.description}`);
      lines.push(`${env.key}=${env.example ?? env.defaultValue ?? ""}`);
    }
    lines.push("");
  }

  lines.push("# Server");
  lines.push("PORT=8080");
  lines.push("NODE_ENV=development");
  lines.push("");

  return { path: ".env.example", content: lines.join("\n") };
}

// ─── tsconfig.json ───────────────────────────────────────────────────────────

function generateTsconfig(): ScaffoldFile {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      outDir: "./dist",
      rootDir: ".",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      declaration: true,
      jsx: "react-jsx",
      paths: { "@/*": ["./*"] },
    },
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules", "dist"],
  };
  return {
    path: "tsconfig.json",
    content: JSON.stringify(config, null, 2) + "\n",
  };
}

// ─── .gitignore ──────────────────────────────────────────────────────────────

function generateGitignore(): ScaffoldFile {
  return {
    path: ".gitignore",
    content: `node_modules/
dist/
.env
*.log
.DS_Store
`,
  };
}

// ─── README.md ───────────────────────────────────────────────────────────────

function generateReadme(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;
  const lines: string[] = [];

  lines.push(`# ${agentName}\n`);
  lines.push(`> Built with [Ruh.ai](https://ruh.ai) — digital employees with a soul.\n`);

  lines.push("## Quick Start\n");
  lines.push("```bash");
  lines.push("# Clone and install");
  lines.push("git clone <repo-url>");
  lines.push(`cd ${agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "agent"}`);
  lines.push("cp .env.example .env  # fill in your credentials");
  lines.push("npm install");
  if (hasDb) {
    lines.push("\n# Start database and run migrations");
    lines.push("docker-compose up -d postgres");
    lines.push("npm run db:migrate");
  }
  lines.push("\n# Start the agent");
  lines.push("npm run dev");
  lines.push("```\n");

  if (plan.skills.length > 0) {
    lines.push("## Skills\n");
    lines.push("| Skill | Description |");
    lines.push("|-------|-------------|");
    for (const s of plan.skills) {
      lines.push(`| ${s.name} | ${s.description} |`);
    }
    lines.push("");
  }

  if (plan.envVars.length > 0) {
    lines.push("## Environment Variables\n");
    lines.push("| Variable | Description | Required |");
    lines.push("|----------|-------------|----------|");
    for (const e of plan.envVars) {
      lines.push(`| \`${e.key}\` | ${e.description} | ${e.required ? "Yes" : "No"} |`);
    }
    lines.push("");
  }

  lines.push("## Architecture\n");
  lines.push("See `.openclaw/plan/PLAN.md` for the full architecture plan.");
  lines.push("See `.openclaw/discovery/PRD.md` and `TRD.md` for requirements.\n");

  return { path: "README.md", content: lines.join("\n") };
}

// ─── .openclaw/setup.json ────────────────────────────────────────────────────

function generateSetupJson(plan: ArchitecturePlan): ScaffoldFile {
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;
  const hasBackend = (plan.apiEndpoints?.length ?? 0) > 0;
  const hasDashboard = (plan.dashboardPages?.length ?? 0) > 0;

  const setup: Array<{ name: string; command: string; condition?: string; optional?: boolean }> = [];
  if (hasDb) {
    setup.push({ name: "migrate", command: "npm run db:migrate", condition: "file:db/migrations" });
    setup.push({ name: "seed", command: "npm run db:seed", condition: "file:db/seed.ts", optional: true });
  }

  // Dashboard build step — compiles React → static HTML/JS
  if (hasDashboard) {
    setup.push({
      name: "dashboard-build",
      command: "cd dashboard && npx vite build --outDir dist 2>&1",
      condition: "file:dashboard/index.html",
      optional: true,
    });
  }

  // Cron trigger scripts are generated for deploy/runtime handoff, but Build
  // setup does not install them. Installing crons here can fire immediate
  // agent turns and contend with verification on the sandbox gateway lane.

  // Single-port architecture: the backend serves both API AND dashboard static files.
  // No separate serve process — eliminates CORS, SPA routing, and proxy issues.
  const services: Array<{ name: string; command: string; port: number; healthCheck?: string; optional?: boolean }> = [];
  if (hasBackend || hasDashboard) {
    services.push({
      name: "backend",
      command: "env PORT=3100 npx tsx backend/index.ts",
      port: 3100,
      healthCheck: "/health",
    });
    // Register dashboard on the same port so the builder tab discovers it
    if (hasDashboard) {
      services.push({ name: "dashboard", command: "", port: 3100, healthCheck: "/health", optional: true });
    }
  }

  const manifest = {
    schemaVersion: 1,
    install: "NODE_ENV=development npm install --include=dev",
    setup,
    services,
    requires: {
      postgres: hasDb,
      redis: false,
    },
  };

  return {
    path: ".openclaw/setup.json",
    content: JSON.stringify(manifest, null, 2) + "\n",
  };
}

// ─── Dashboard entry files ───────────────────────────────────────────────────

// ─── Dashboard template generator ───────────────────────────────────────────
// Generates a COMPLETE working dashboard from the architecture plan.
// Every file is deterministic (no LLM). The dashboard works immediately
// after scaffold + npm install + vite build.

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function pascalCase(title: string): string {
  return title.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
}

function hookName(dataSource: string): string {
  // /api/amazon/overview → useAmazonOverview
  const parts = dataSource.replace(/^\/api\//, "").split(/[/?]/).filter(Boolean).filter(p => !p.startsWith(":"));
  const name = parts
    .flatMap((part) => part.split(/[^a-zA-Z0-9]+/).filter(Boolean))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `use${name || "Data"}`;
}

function legacyHookName(dataSource: string): string {
  const parts = dataSource.replace(/^\/api\//, "").split(/[/?]/).filter(Boolean).filter(p => !p.startsWith(":"));
  const name = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `use${name || "Data"}`;
}

function js(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function findPrototypePage(
  plan: ArchitecturePlan,
  page: DashboardPage,
): DashboardPrototypePage | null {
  return plan.dashboardPrototype?.pages.find((prototypePage) =>
    prototypePage.path === page.path || prototypePage.title === page.title
  ) ?? null;
}

function prototypeWorkflowsForPage(
  plan: ArchitecturePlan,
  prototypePage: DashboardPrototypePage | null,
): DashboardPrototypeWorkflow[] {
  if (!prototypePage || !plan.dashboardPrototype) return [];
  const workflowIds = new Set(prototypePage.supportsWorkflows);
  return plan.dashboardPrototype.workflows.filter((workflow) => workflowIds.has(workflow.id));
}

function routePartsForEndpoint(path: string): { group: string; subPath: string } {
  const parts = path.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const group = parts[0] ?? "main";
  const subParts = parts.slice(1).map((part) => {
    if (!part.startsWith(":")) return part;
    return `:${part.slice(1).replace(/[^A-Za-z0-9_]/g, "") || "id"}`;
  });
  return {
    group,
    subPath: `/${subParts.join("/")}` || "/",
  };
}

function actionEndpointScore(action: DashboardPrototypeAction, endpoint: ApiEndpoint): number {
  if (endpoint.method.toUpperCase() !== "POST") return -1;
  const actionText = `${action.id} ${action.label} ${action.type}`.toLowerCase();
  const endpointText = `${endpoint.path} ${endpoint.description}`.toLowerCase();
  let score = 0;

  for (const token of actionText.split(/[^a-z0-9]+/).filter((token) => token.length > 2)) {
    if (endpointText.includes(token)) score += 2;
  }

  if (action.type === "create" && /create|reset|new|project|estimate/.test(endpointText)) score += 12;
  if (action.type === "run_pipeline" && /pipeline|run|step|qa/.test(endpointText)) score += 12;
  if (action.type === "approve" && /approve|approval/.test(endpointText)) score += 12;
  if (action.type === "request_revision" && /revision|revise|request/.test(endpointText)) score += 12;
  if (action.type === "resolve_blocker" && /blocker|resolve/.test(endpointText)) score += 12;
  if (action.type === "publish" && /publish|package|artifact|archive/.test(endpointText)) score += 12;

  if (/artifact/.test(actionText) && /artifact/.test(endpointText)) score += 8;
  if (/qa|guardrail|check/.test(actionText) && /qa|check/.test(endpointText)) score += 8;
  if (/role/.test(actionText) && /role|session/.test(endpointText)) score += 8;

  return score;
}

function prototypeActionEndpointMap(plan: ArchitecturePlan): Record<string, { method: string; path: string }> {
  const actions = plan.dashboardPrototype?.actions ?? [];
  const endpoints = plan.apiEndpoints ?? [];
  const endpointMap: Record<string, { method: string; path: string }> = {};

  for (const action of actions) {
    const best = endpoints
      .map((endpoint) => ({ endpoint, score: actionEndpointScore(action, endpoint) }))
      .sort((left, right) => right.score - left.score)[0];
    if (best && best.score > 0) {
      endpointMap[action.id] = {
        method: best.endpoint.method.toUpperCase(),
        path: best.endpoint.path,
      };
    }
  }

  return endpointMap;
}

function renderDashboardPrototypePanel(
  plan: ArchitecturePlan,
  prototypePage: DashboardPrototypePage | null,
): string {
  if (!prototypePage || !plan.dashboardPrototype) return "";
  const workflows = prototypeWorkflowsForPage(plan, prototypePage);
  const actionEndpoints = prototypeActionEndpointMap(plan);

  return `
const prototypePage = ${js(prototypePage)};
const prototypeWorkflows = ${js(workflows)};
const prototypeActions = ${js(plan.dashboardPrototype.actions ?? [])};
const prototypeActionEndpoints = ${js(actionEndpoints)} as Record<string, { method: string; path: string }>;
const prototypePipeline = ${js(plan.dashboardPrototype.pipeline ?? null)} as {
  name: string;
  steps: Array<{ id: string; name: string; owner?: string; description?: string; producesArtifacts?: string[] }>;
} | null;
const prototypeArtifacts = ${js(plan.dashboardPrototype.artifacts ?? [])};
const prototypeEmptyState = ${js(plan.dashboardPrototype.emptyState ?? "Create a work item to validate this dashboard workflow.")};
const prototypeRevisionPrompts = ${js(plan.dashboardPrototype.revisionPrompts)} as string[];
const prototypeApprovalChecklist = ${js(plan.dashboardPrototype.approvalChecklist)} as string[];

function DashboardPrototypePanel() {
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);

  async function runPrototypeAction(action: { id: string; label: string }) {
    const endpoint = prototypeActionEndpoints[action.id];
    if (!endpoint) {
      setActionMessage(\`\${action.label} is planned but has no API endpoint yet.\`);
      return;
    }

    setBusyAction(action.id);
    setActionMessage(null);
    try {
      const response = await fetch(endpoint.path, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: endpoint.method === 'GET' ? undefined : JSON.stringify({ actionId: action.id, actionLabel: action.label }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Action failed');
      setActionMessage(payload?.message ?? \`\${action.label} completed.\`);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'uppercase', color: '#7b5aff', marginBottom: 8 }}>Prototype approval gate</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>{prototypePage.title}</h2>
      <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14 }}>{prototypePage.purpose}</p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Operator actions</div>
          {prototypeActions.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {prototypeActions.map((action) => (
                <button key={action.id} type="button" onClick={() => runPrototypeAction(action)} disabled={busyAction === action.id} style={{ border: action.primary ? '1px solid #ae00d0' : '1px solid #e5e7eb', background: action.primary ? '#ae00d0' : '#fff', color: action.primary ? '#fff' : '#111827', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontWeight: 700, opacity: busyAction === action.id ? 0.65 : 1, cursor: 'pointer' }}>
                  {busyAction === action.id ? 'Working...' : action.label}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{prototypeEmptyState}</p>
          )}
          {actionMessage ? <p style={{ margin: '10px 0 0', color: '#4b5563', fontSize: 12 }}>{actionMessage}</p> : null}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Generated artifacts</div>
          {prototypeArtifacts.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{prototypeArtifacts.map((artifact) => <li key={artifact.id}>{artifact.name} <span style={{ color: '#6b7280' }}>({artifact.type})</span></li>)}</ul>
          ) : (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>No generated artifacts planned.</p>
          )}
        </div>
      </div>

      {prototypePipeline && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>{prototypePipeline.name}</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {prototypePipeline.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.name}</strong>{step.owner ? <span style={{ color: '#6b7280' }}> · {step.owner}</span> : null}
                {step.description ? <div style={{ color: '#6b7280', fontSize: 12 }}>{step.description}</div> : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {prototypeWorkflows.map((workflow) => (
        <div key={workflow.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 14 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{workflow.name}</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Workflow steps</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{workflow.steps.map((step) => <li key={step}>{step}</li>)}</ul>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Required actions</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{workflow.requiredActions.map((action) => <li key={action}>{action}</li>)}</ul>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Success criteria</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{workflow.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            </div>
          </div>
        </div>
      ))}

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Page acceptance criteria</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{prototypePage.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
      </div>

      {prototypeRevisionPrompts.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Review prompts</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{prototypeRevisionPrompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
        </div>
      )}

      {prototypeApprovalChecklist.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>Approval checklist</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{prototypeApprovalChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
`;
}

export function staleScaffoldFilesForPlan(rawPlan: ArchitecturePlan | Record<string, unknown>): string[] {
  const plan = normalizePlan(rawPlan as Record<string, unknown>);
  const stale = new Set<string>([
    "BOOTSTRAP.md",
    "dashboard/components/ui.ts",
  ]);
  const dataSources = new Set<string>();

  for (const endpoint of plan.apiEndpoints ?? []) dataSources.add(endpoint.path);
  for (const page of plan.dashboardPages ?? []) {
    for (const component of page.components ?? []) dataSources.add(component.dataSource);
  }

  for (const dataSource of dataSources) {
    const legacyName = legacyHookName(dataSource);
    if (legacyName !== hookName(dataSource)) stale.add(`dashboard/hooks/${legacyName}.ts`);
  }

  return Array.from(stale);
}

function generateDashboardFiles(plan: ArchitecturePlan): ScaffoldFile[] {
  if (!(plan.dashboardPages?.length)) return [];
  const pages = plan.dashboardPages;
  const files: ScaffoldFile[] = [];

  // ── index.html ──
  files.push({
    path: "dashboard/index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <base href="/">
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
`,
  });

  // ── vite.config.ts ──
  files.push({
    path: "dashboard/vite.config.ts",
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 3200 },
});
`,
  });

  // ── components/types.ts ──
  files.push({
    path: "dashboard/components/types.ts",
    content: `export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}
`,
  });

  // ── components/ui.tsx — design tokens + shared styles ──
  files.push({
    path: "dashboard/components/ui.tsx",
    content: `import type { CSSProperties } from 'react';

export const tokens = {
  primary: '#ae00d0',
  primaryHover: '#9400b4',
  secondary: '#7b5aff',
  background: '#f9f7f9',
  cardColor: '#ffffff',
  sidebarBg: '#fdfbff',
  textPrimary: '#121212',
  textSecondary: '#4b5563',
  textTertiary: '#9ca3af',
  borderDefault: '#e5e7eb',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  gradient: 'linear-gradient(135deg, #ae00d0, #7b5aff)',
};

export const pageStyle: CSSProperties = { padding: 24, maxWidth: 1200 };
export const cardStyle: CSSProperties = { background: tokens.cardColor, border: \`1px solid \${tokens.borderDefault}\`, borderRadius: 12, padding: 20, marginBottom: 16 };
export const headingStyle: CSSProperties = { fontSize: 20, fontWeight: 700, color: tokens.textPrimary, marginBottom: 4 };
export const subheadingStyle: CSSProperties = { fontSize: 13, color: tokens.textSecondary, marginBottom: 20 };
export const gridStyle = (cols: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: \`repeat(\${cols}, 1fr)\`, gap: 16, marginBottom: 24 });

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: tokens.textTertiary }}>{label}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div style={{ ...cardStyle, borderColor: tokens.error, color: tokens.error }}>{message}</div>;
}
export function EmptyState({ title = 'No data', description = '' }: { title?: string; description?: string }) {
  return <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontWeight: 600, color: tokens.textSecondary }}>{title}</div>{description && <div style={{ fontSize: 13, color: tokens.textTertiary, marginTop: 4 }}>{description}</div>}</div>;
}
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return <div style={{ marginBottom: 24 }}><h1 style={headingStyle}>{title}</h1>{description && <p style={subheadingStyle}>{description}</p>}</div>;
}
`,
  });

  // ── components/MetricCard.tsx ──
  files.push({
    path: "dashboard/components/MetricCard.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

export function MetricCard({ label, value, trend }: { label: string; value: string | number; trend?: string }) {
  return (
    <div style={{ ...cardStyle, borderLeft: \`4px solid \${tokens.primary}\`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: tokens.textPrimary }}>{value}</div>
      <div style={{ fontSize: 13, color: tokens.textSecondary }}>{label}</div>
      {trend && <div style={{ fontSize: 12, color: tokens.textTertiary }}>{trend}</div>}
    </div>
  );
}
`,
  });

  // ── components/DataTable.tsx ──
  files.push({
    path: "dashboard/components/DataTable.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

export function DataTable({ columns, rows, emptyMessage = 'No data' }: { columns: string[]; rows: Record<string, unknown>[]; emptyMessage?: string }) {
  if (!rows.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary, padding: 32 }}>{emptyMessage}</div>;
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', borderBottom: \`1px solid \${tokens.borderDefault}\`, fontWeight: 600, color: tokens.textSecondary, background: '#fafafa' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#fafafa' : 'white' }}>
              {columns.map((c) => <td key={c} style={{ padding: '10px 14px', borderBottom: \`1px solid \${tokens.borderDefault}\`, color: tokens.textPrimary }}>{String(row[c] ?? row[c.toLowerCase()] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TableStatus({ status }: { status: string }) {
  const color = status === 'active' ? tokens.success : status === 'error' ? tokens.error : tokens.warning;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: color + '18', color }}>{status}</span>;
}
`,
  });

  // ── components/ActivityFeed.tsx ──
  files.push({
    path: "dashboard/components/ActivityFeed.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

interface FeedItem { id: string; title: string; description?: string; timestamp?: string; status?: string }

export function ActivityFeed({ items, emptyMessage = 'No recent activity yet' }: { items: FeedItem[]; emptyMessage?: string }) {
  if (!items.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary }}>{emptyMessage}</div>;
  return (
    <div style={cardStyle}>
      {items.map((item) => (
        <div key={item.id} style={{ padding: '10px 0', borderBottom: \`1px solid \${tokens.borderDefault}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontWeight: 500, color: tokens.textPrimary, fontSize: 13 }}>{item.title}</div>{item.description && <div style={{ fontSize: 12, color: tokens.textTertiary }}>{item.description}</div>}</div>
          {item.timestamp && <div style={{ fontSize: 11, color: tokens.textTertiary, whiteSpace: 'nowrap' }}>{item.timestamp}</div>}
        </div>
      ))}
    </div>
  );
}
`,
  });

  // ── components/BarChart.tsx + LineChart.tsx + PieChart.tsx ──
  const chartTemplate = (chartType: string) => `import React from 'react';
import { tokens, cardStyle } from './ui';

export function ${chartType}({ data, label = '' }: { data: Array<{ label: string; value: number }>; label?: string }) {
  if (!data.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary }}>No chart data available</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={cardStyle}>
      {label && <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, marginBottom: 12 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', background: tokens.primary + '30', borderRadius: 4, height: Math.max(4, (d.value / max) * 100), transition: 'height 0.3s' }} />
            <div style={{ fontSize: 10, color: tokens.textTertiary, textAlign: 'center' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

  files.push({ path: "dashboard/components/BarChart.tsx", content: chartTemplate("BarChart") });
  files.push({ path: "dashboard/components/LineChart.tsx", content: chartTemplate("LineChart") });
  files.push({ path: "dashboard/components/PieChart.tsx", content: chartTemplate("PieChart") });

  // ── hooks/useApi.ts ──
  files.push({
    path: "dashboard/hooks/useApi.ts",
    content: `import { useEffect, useState } from 'react';
import type { AsyncState } from '../components/types';

export function useApi<T>(url: string, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((s: AsyncState<T>) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: controller.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) throw new Error((json as {error?:{message?:string}})?.error?.message || 'Request failed');
        setState({ data: json as T, loading: false, error: null });
      })
      .catch(e => { if (active && !controller.signal.aborted) setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Unknown error' }); });
    return () => { active = false; controller.abort(); };
  }, deps);
  return state;
}
`,
  });

  // ── Collect unique data sources and generate hooks ──
  const seenHooks = new Set<string>();
  for (const page of pages) {
    for (const comp of page.components ?? []) {
      if (!comp.dataSource) continue;
      const name = hookName(comp.dataSource);
      if (seenHooks.has(name)) continue;
      seenHooks.add(name);
      const cleanPath = comp.dataSource.split("?")[0];
      files.push({
        path: `dashboard/hooks/${name}.ts`,
        content: `import { useApi } from './useApi';\n\nexport function ${name}() {\n  return useApi<Record<string, unknown>>('${cleanPath}');\n}\n`,
      });
    }
  }

  // ── layout.tsx ──
  const navItems = pages.map((p) => `  { href: '${p.path}', label: '${p.title}' },`).join("\n");
  files.push({
    path: "dashboard/layout.tsx",
    content: `import React, { type ReactNode } from 'react';
import { tokens } from './components/ui';

const navItems = [
${navItems}
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '240px 1fr', background: tokens.background, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <aside style={{ background: tokens.sidebarBg, borderRight: \`1px solid \${tokens.borderDefault}\`, padding: 20 }}>
        <div style={{ padding: '8px 10px 20px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: tokens.gradient, marginBottom: 14 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>Mission Control</div>
          <div style={{ color: tokens.textSecondary, fontSize: 14, marginTop: 4 }}>Agent operations</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {navItems.map((item) => {
            const active = currentPath === item.href || currentPath.startsWith(item.href + '/');
            return (
              <a key={item.href} href={item.href} style={{ display: 'block', padding: '11px 12px', borderRadius: 10, color: active ? tokens.primary : tokens.textSecondary, background: active ? 'rgba(174,0,208,0.08)' : 'transparent', textDecoration: 'none', fontSize: 14, fontWeight: active ? 600 : 400 }}>
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>
      <main style={{ padding: 0, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
`,
  });

  // ── main.tsx ──
  const pageImports = pages.map((p, i) => `import Page${i} from './pages/${slugify(p.title)}';`).join("\n");
  const pageRoutes = pages.map((p, i) => `          <Route path="${p.path}" element={<Page${i} />} />`).join("\n");

  files.push({
    path: "dashboard/main.tsx",
    content: `import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layout';
${pageImports}

function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
${pageRoutes}
          <Route path="*" element={<Navigate to="${pages[0]?.path ?? "/"}" replace />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
  });

  // ── Page files — one per dashboardPage ──
  for (const page of pages) {
    const pageSlug = slugify(page.title);
    const pageName = pascalCase(page.title) + "Page";
    const prototypePage = findPrototypePage(plan, page);
    const prototypePanel = renderDashboardPrototypePanel(plan, prototypePage);

    // Collect hooks this page needs
    const pageHooks = new Map<string, string>();
    for (const comp of page.components ?? []) {
      if (!comp.dataSource) continue;
      const name = hookName(comp.dataSource);
      if (!pageHooks.has(name)) pageHooks.set(name, name);
    }

    const hookImports = Array.from(pageHooks.values()).map((h) => `import { ${h} } from '../hooks/${h}';`).join("\n");
    const hookCalls = Array.from(pageHooks.values()).map((h) => `  const ${h.replace(/^use/, "").charAt(0).toLowerCase() + h.replace(/^use/, "").slice(1)} = ${h}();`).join("\n");
    const firstHookVar = pageHooks.size > 0 ? (Array.from(pageHooks.values())[0].replace(/^use/, "").charAt(0).toLowerCase() + Array.from(pageHooks.values())[0].replace(/^use/, "").slice(1)) : null;

    // Determine which components to import
    const compTypes = new Set((page.components ?? []).map((c) => c.type));
    const compImports: string[] = [];
    if (compTypes.has("metric-cards")) compImports.push(`import { MetricCard } from '../components/MetricCard';`);
    if (compTypes.has("data-table")) compImports.push(`import { DataTable } from '../components/DataTable';`);
    if (compTypes.has("activity-feed")) compImports.push(`import { ActivityFeed } from '../components/ActivityFeed';`);
    if (compTypes.has("bar-chart")) compImports.push(`import { BarChart } from '../components/BarChart';`);
    if (compTypes.has("line-chart")) compImports.push(`import { LineChart } from '../components/LineChart';`);
    if (compTypes.has("pie-chart")) compImports.push(`import { PieChart } from '../components/PieChart';`);

    // Generate component usage
    const compUsage = (page.components ?? []).map((comp) => {
      const d = firstHookVar ? `${firstHookVar}.data` : "null";
      switch (comp.type) {
        case "metric-cards": return `      <div style={gridStyle(3)}>\n        <MetricCard label="Total" value={Object.values((${d} as Record<string,unknown>)?.metrics ?? {}).length} />\n      </div>`;
        case "data-table": return `      <DataTable columns={Object.keys(((${d} as Record<string,unknown>)?.items as Record<string,unknown>[])?.[0] ?? {})} rows={((${d} as Record<string,unknown>)?.items as Record<string,unknown>[]) ?? []} />`;
        case "activity-feed": return `      <ActivityFeed items={[]} />`;
        case "bar-chart": return `      <BarChart data={[]} label="${comp.title ?? "Chart"}" />`;
        case "line-chart": return `      <LineChart data={[]} label="${comp.title ?? "Trend"}" />`;
        case "pie-chart": return `      <PieChart data={[]} label="${comp.title ?? "Distribution"}" />`;
        default: return `      {/* ${comp.type} */}`;
      }
    }).join("\n");

    files.push({
      path: `dashboard/pages/${pageSlug}.tsx`,
      content: `import React from 'react';
import { pageStyle, gridStyle, LoadingState, ErrorState, EmptyState, PageHeader${prototypePanel ? ", cardStyle" : ""} } from '../components/ui';
${compImports.join("\n")}
${hookImports}
${prototypePanel}

export default function ${pageName}() {
${hookCalls}

${firstHookVar ? `  if (${firstHookVar}.loading) return <div style={pageStyle}><LoadingState /></div>;
  if (${firstHookVar}.error) return <div style={pageStyle}><ErrorState message={${firstHookVar}.error} /></div>;
  if (!${firstHookVar}.data) return <div style={pageStyle}><EmptyState /></div>;` : ""}

  return (
    <div style={pageStyle}>
      <PageHeader title="${page.title}" description="${page.description ?? ""}" />
${prototypePanel ? "      <DashboardPrototypePanel />" : ""}
${compUsage}
    </div>
  );
}
`,
    });
  }

  return files;
}

// ─── Backend entry file ─────────────────────────────────────────────────────
// Generates a working backend/index.ts that serves both API routes and
// the dashboard static files. The backend specialist only needs to fill in
// the route handler files — the framework is ready.

function generateBackendEntryFile(plan: ArchitecturePlan): ScaffoldFile | null {
  if (!(plan.apiEndpoints?.length) && !(plan.dashboardPages?.length)) return null;

  const hasDashboard = (plan.dashboardPages?.length ?? 0) > 0;

  // Group endpoints by their common path prefix to derive route files.
  // /api/amazon/overview and /api/amazon/listings → one "amazon" router
  const routeGroups = new Map<string, string>();
  for (const ep of plan.apiEndpoints ?? []) {
    const { group } = routePartsForEndpoint(ep.path);
    if (!routeGroups.has(group)) {
      const varName = group.replace(/-./g, (m) => m[1].toUpperCase()) + "Router";
      routeGroups.set(group, varName);
    }
  }

  const routeImports = Array.from(routeGroups.entries()).map(([group, varName]) =>
    `import ${varName} from './routes/${group}';`
  ).join("\n");

  const routeMounts = Array.from(routeGroups.entries()).map(([group, varName]) =>
    `app.use('/api/${group}', ${varName});`
  ).join("\n");

  const dashboardServing = hasDashboard ? `
// Serve dashboard static files (single-port architecture)
const dashDist = path.join(process.cwd(), 'dashboard', 'dist');
app.use(express.static(dashDist));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { message: 'Not Found', code: 'NOT_FOUND' } });
  }
  res.sendFile(path.join(dashDist, 'index.html'));
});
` : `
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not Found', code: 'NOT_FOUND' } });
});
`;

  return {
    path: "backend/index.ts",
    content: `import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
${routeImports}

const app = express();
const port = Number(process.env.PORT || 3100);

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => { res.json({ ok: true }); });

// API routes
${routeMounts}
${dashboardServing}
// Error handler
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  res.status(500).json({ error: { message, code: 'INTERNAL_SERVER_ERROR' } });
});

app.listen(port, () => { console.log(\`Backend listening on port \${port}\`); });
export default app;
`,
  };
}

// ─── Demo route files ───────────────────────────────────────────────────────
// Generate stateful demo route files so the dashboard starts with real
// sandbox data and clickable prototype actions before specialists deepen
// integrations.

function generatePlaceholderRoutes(plan: ArchitecturePlan): ScaffoldFile[] {
  if (!(plan.apiEndpoints?.length)) return [];

  // Group endpoints by first path segment (same logic as backend entry file)
  const groups = new Map<string, Array<{ method: string; path: string; subPath: string; description: string }>>();
  for (const ep of plan.apiEndpoints) {
    const { group, subPath } = routePartsForEndpoint(ep.path);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ method: ep.method, path: ep.path, subPath, description: ep.description });
  }

  const files: ScaffoldFile[] = [];
  for (const [group, endpoints] of groups) {
    const routes = endpoints.map((ep) => {
      const m = ep.method.toLowerCase();
      return `router.${m}('${ep.subPath}', (req, res) => {\n  res.json(handleEndpoint('${ep.method.toUpperCase()}', '${ep.path.replace(/'/g, "\\'")}', req));\n});`;
    }).join("\n\n");

    files.push({
      path: `backend/routes/${group}.ts`,
      content: `import { Router, type Request } from 'express';

const router = Router();

type StepStatus = 'pending' | 'running' | 'complete' | 'blocked';
type ArtifactStatus = 'not_generated' | 'generated' | 'approved' | 'revision_requested';
type RawPipelineStep = {
  id?: string;
  name?: string;
  description?: string;
  owner?: string;
  producesArtifacts?: string[];
  requiresApproval?: boolean;
};
type PipelineStep = {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  producesArtifacts: string[];
  requiresApproval: boolean;
  status: StepStatus;
  completedAt?: string;
};
type RawArtifact = {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  producedByStepId?: string;
  reviewActions?: string[];
  acceptanceCriteria?: string[];
};
type Artifact = {
  id: string;
  name: string;
  type: string;
  description?: string;
  producedByStepId?: string;
  reviewActions: string[];
  acceptanceCriteria: string[];
  status: ArtifactStatus;
  version: number;
  updatedAt?: string;
  revisionRequest?: string;
};
type DemoState = {
  role: string;
  project: Record<string, unknown>;
  pipeline: PipelineStep[];
  estimate: Record<string, unknown>;
  lineItems: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown> & { status: string }>;
  assumptions: string[];
  exclusions: string[];
  artifacts: Artifact[];
  qaChecks: Array<Record<string, unknown> & { status: string }>;
  activity: Array<{ id: string; title: string; description: string; timestamp: string; status: string }>;
  revisionRequests: Array<Record<string, unknown>>;
};

const endpointDescriptions = ${js(Object.fromEntries(endpoints.map((ep) => [ep.path, ep.description])))} as Record<string, string>;
const prototypeSummary = ${js(plan.dashboardPrototype?.summary ?? "Agent dashboard sandbox")};
const prototypePrimaryUsers = ${js(plan.dashboardPrototype?.primaryUsers ?? [])} as string[];
const pipelineName = ${js(plan.dashboardPrototype?.pipeline?.name ?? "Agent workflow pipeline")};
const pipelineTemplate = ${js(plan.dashboardPrototype?.pipeline?.steps?.length ? plan.dashboardPrototype.pipeline.steps : [
  { id: "intake", name: "Intake" },
  { id: "process", name: "Process" },
  { id: "review", name: "Review" },
])} as RawPipelineStep[];
const artifactTemplate = ${js(plan.dashboardPrototype?.artifacts?.length ? plan.dashboardPrototype.artifacts : [
  { id: "summary", name: "Summary artifact", type: "document", reviewActions: ["approve_artifact", "request_revision"], acceptanceCriteria: ["Generated from sandbox data"] },
])} as RawArtifact[];

function slug(value: string, fallback: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function timestamp(): string {
  return new Date().toISOString();
}

function normalizeStep(step: RawPipelineStep, index: number): PipelineStep {
  const name = step.name || \`Step \${index + 1}\`;
  return {
    id: step.id || slug(name, \`step-\${index + 1}\`),
    name,
    description: step.description,
    owner: step.owner,
    producesArtifacts: Array.isArray(step.producesArtifacts) ? step.producesArtifacts : [],
    requiresApproval: Boolean(step.requiresApproval),
    status: index === 0 ? 'running' : 'pending',
  };
}

function normalizeArtifact(artifact: RawArtifact, index: number): Artifact {
  const name = artifact.name || \`Artifact \${index + 1}\`;
  return {
    id: artifact.id || slug(name, \`artifact-\${index + 1}\`),
    name,
    type: artifact.type || 'document',
    description: artifact.description,
    producedByStepId: artifact.producedByStepId,
    reviewActions: Array.isArray(artifact.reviewActions) ? artifact.reviewActions : [],
    acceptanceCriteria: Array.isArray(artifact.acceptanceCriteria) ? artifact.acceptanceCriteria : [],
    status: 'not_generated',
    version: 0,
  };
}

function createInitialState(): DemoState {
  return {
    role: prototypePrimaryUsers[0] || 'Operator',
    project: {
      id: 'demo-project',
      name: 'Austin 15k SF TI Estimate',
      client: 'ECC Sandbox Client',
      phase: 'Preconstruction',
      status: 'sandbox-ready',
      sandbox: true,
      summary: prototypeSummary,
    },
    pipeline: pipelineTemplate.map(normalizeStep),
    estimate: {
      totalCost: 1482500,
      confidence: 0.82,
      contingencyPct: 7.5,
      lastUpdated: timestamp(),
      sourceMix: 'synthetic takeoff + seeded historical pricing',
    },
    lineItems: [
      { Trade: 'General Conditions', Quantity: 1, Unit: 'lot', UnitCost: 185000, Total: 185000, Source: 'seeded benchmark', Status: 'reviewed' },
      { Trade: 'Partitions', Quantity: 15000, Unit: 'sf', UnitCost: 18.5, Total: 277500, Source: 'synthetic takeoff', Status: 'priced' },
      { Trade: 'MEP Allowance', Quantity: 15000, Unit: 'sf', UnitCost: 42, Total: 630000, Source: 'hybrid pricing', Status: 'risk flagged' },
      { Trade: 'Finishes', Quantity: 15000, Unit: 'sf', UnitCost: 26, Total: 390000, Source: 'seeded vendor range', Status: 'priced' },
    ],
    risks: [
      { id: 'risk-1', title: 'MEP scope variance', severity: 'high', owner: 'Estimator', status: 'open' },
      { id: 'risk-2', title: 'Long-lead fixture allowance', severity: 'medium', owner: 'Preconstruction Manager', status: 'monitoring' },
    ],
    blockers: [
      { id: 'blocker-1', title: 'Confirm AHU reuse assumption', severity: 'high', status: 'open', owner: 'Estimator' },
    ],
    assumptions: ['Pricing is sandbox-only and must not be sent externally.', 'Existing drawings are represented by synthetic takeoff quantities.'],
    exclusions: ['Permit fees', 'Owner-furnished equipment'],
    artifacts: artifactTemplate.map(normalizeArtifact),
    qaChecks: [
      { id: 'qa-1', name: 'Sandbox label present', status: 'pass' },
      { id: 'qa-2', name: 'No external send action', status: 'pass' },
      { id: 'qa-3', name: 'Overrides require comments', status: 'pass' },
      { id: 'qa-4', name: 'Artifacts need explicit approval', status: 'pending' },
    ],
    activity: [
      { id: 'event-1', title: 'Sandbox estimate initialized', description: 'Demo data is ready for operator validation.', timestamp: timestamp(), status: 'ready' },
    ],
    revisionRequests: [],
  };
}

let state = createInitialState();

function pushActivity(title: string, description: string, status = 'updated') {
  state.activity.unshift({ id: \`event-\${Date.now()}\`, title, description, timestamp: timestamp(), status });
  state.activity = state.activity.slice(0, 20);
}

function pipelineMetrics() {
  return {
    totalSteps: state.pipeline.length,
    completeSteps: state.pipeline.filter((step) => step.status === 'complete').length,
    blockedSteps: state.pipeline.filter((step) => step.status === 'blocked').length,
    generatedArtifacts: state.artifacts.filter((artifact) => artifact.status !== 'not_generated').length,
  };
}

function dashboardOverview(endpoint: string) {
  return {
    endpoint,
    description: endpointDescriptions[endpoint] || 'Dashboard sandbox data',
    project: state.project,
    metrics: {
      estimateTotal: state.estimate.totalCost,
      confidence: state.estimate.confidence,
      openBlockers: state.blockers.filter((blocker) => blocker.status !== 'resolved').length,
      approvedArtifacts: state.artifacts.filter((artifact) => artifact.status === 'approved').length,
    },
    items: state.pipeline.map((step) => ({ Step: step.name, Status: step.status, Owner: step.owner || state.role })),
    activity: state.activity,
  };
}

function completeProducedArtifacts(step: PipelineStep) {
  const produced = new Set(step.producesArtifacts);
  if (produced.size === 0 && /artifact|package/i.test(step.name)) {
    for (const artifact of state.artifacts) produced.add(artifact.id);
  }

  for (const artifact of state.artifacts) {
    if (produced.has(artifact.id) || produced.has(artifact.name)) {
      artifact.status = 'generated';
      artifact.version += 1;
      artifact.updatedAt = timestamp();
    }
  }
}

function advancePipeline() {
  const running = state.pipeline.find((step) => step.status === 'running');
  const current = running ?? state.pipeline.find((step) => step.status === 'pending');
  if (!current) {
    pushActivity('Pipeline already complete', 'All planned steps are complete.', 'complete');
    return null;
  }

  current.status = 'complete';
  current.completedAt = timestamp();
  completeProducedArtifacts(current);

  const next = state.pipeline.find((step) => step.status === 'pending');
  if (next) next.status = 'running';
  state.estimate.lastUpdated = timestamp();
  pushActivity('Pipeline step completed', current.name, 'complete');
  return current;
}

function generateArtifacts() {
  for (const artifact of state.artifacts) {
    if (artifact.status === 'not_generated') artifact.status = 'generated';
    artifact.version += 1;
    artifact.updatedAt = timestamp();
  }
  pushActivity('Artifacts generated', \`\${state.artifacts.length} artifact(s) are ready for review.\`, 'generated');
}

function approveArtifact(artifactId?: string) {
  const artifact = state.artifacts.find((item) => item.id === artifactId)
    ?? state.artifacts.find((item) => item.status === 'generated' || item.status === 'revision_requested')
    ?? state.artifacts[0];
  if (!artifact) return null;
  if (artifact.status === 'not_generated') {
    artifact.status = 'generated';
    artifact.version += 1;
  }
  artifact.status = 'approved';
  artifact.updatedAt = timestamp();
  pushActivity('Artifact approved', artifact.name, 'approved');
  return artifact;
}

function requestRevision(body: Record<string, unknown>) {
  const artifactId = typeof body.artifactId === 'string' ? body.artifactId : undefined;
  const artifact = state.artifacts.find((item) => item.id === artifactId) ?? state.artifacts[0];
  if (!artifact) return null;
  artifact.status = 'revision_requested';
  artifact.revisionRequest = typeof body.comment === 'string' ? body.comment : 'Revision requested from dashboard.';
  artifact.updatedAt = timestamp();
  state.revisionRequests.push({ artifactId: artifact.id, comment: artifact.revisionRequest, createdAt: artifact.updatedAt });
  pushActivity('Revision requested', artifact.name, 'revision');
  return artifact;
}

function resolveBlocker() {
  const blocker = state.blockers.find((item) => item.status !== 'resolved');
  if (!blocker) return null;
  blocker.status = 'resolved';
  blocker.resolvedAt = timestamp();
  pushActivity('Blocker resolved', String(blocker.title), 'resolved');
  return blocker;
}

function runQa() {
  const allArtifactsApproved = state.artifacts.every((artifact) => artifact.status === 'approved');
  state.qaChecks = state.qaChecks.map((check) => {
    if (check.id === 'qa-4') return { ...check, status: allArtifactsApproved ? 'pass' : 'warning' };
    return { ...check, status: 'pass' };
  });
  pushActivity('QA checks run', allArtifactsApproved ? 'All checks passed.' : 'Artifact approvals are still pending.', allArtifactsApproved ? 'pass' : 'warning');
}

function getResponse(path: string, req: Request) {
  if (path.includes('/projects/current')) return { ...dashboardOverview(path), project: state.project, sandboxWarnings: state.assumptions };
  if (path.includes('/pipeline/status')) return { ...dashboardOverview(path), name: pipelineName, steps: state.pipeline, items: state.pipeline.map((step) => ({ Step: step.name, Status: step.status, Owner: step.owner || state.role, Artifacts: step.producesArtifacts.join(', ') || '-' })), events: state.activity, metrics: pipelineMetrics() };
  if (path.includes('/estimate/latest')) return { ...dashboardOverview(path), estimate: state.estimate, metrics: { totalCost: state.estimate.totalCost, confidence: state.estimate.confidence, contingencyPct: state.estimate.contingencyPct } };
  if (path.includes('/estimate/line-items')) return { ...dashboardOverview(path), items: state.lineItems };
  if (path.includes('/risk/summary')) return { ...dashboardOverview(path), risks: state.risks, blockers: state.blockers, assumptions: state.assumptions, exclusions: state.exclusions, items: [...state.risks, ...state.blockers] };
  if (path.includes('/artifacts/') && path.includes('/preview')) {
    const artifactId = req.params.artifactId ?? req.params.id;
    const artifact = state.artifacts.find((item) => item.id === artifactId) ?? state.artifacts[0] ?? null;
    return { ...dashboardOverview(path), artifact, preview: artifact ? \`Preview for \${artifact.name} v\${artifact.version || 1}\` : null };
  }
  if (path.includes('/artifacts')) return { ...dashboardOverview(path), artifacts: state.artifacts, items: state.artifacts.map((artifact) => ({ Name: artifact.name, Type: artifact.type, Status: artifact.status, Version: artifact.version })) };
  if (path.includes('/qa/checks')) return { ...dashboardOverview(path), checks: state.qaChecks, items: state.qaChecks.map((check) => ({ Check: check.name, Status: check.status })) };
  return dashboardOverview(path);
}

function postResponse(path: string, req: Request) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (path.includes('/projects/reset-demo') || path.includes('/projects/create')) {
    state = createInitialState();
    pushActivity('Demo estimate reset', 'A clean sandbox estimate was created.', 'ready');
    return { ok: true, message: 'Demo estimate created.', ...getResponse('/api/${group}/projects/current', req) };
  }
  if (path.includes('/pipeline/run-step')) {
    const step = advancePipeline();
    return { ok: true, message: step ? \`\${step.name} completed.\` : 'Pipeline already complete.', ...getResponse('/api/${group}/pipeline/status', req) };
  }
  if (path.includes('/estimate/override')) {
    const first = state.lineItems[0];
    first.Status = 'override pending review';
    state.estimate.lastUpdated = timestamp();
    pushActivity('Commented override applied', 'A sandbox override was recorded for review.', 'override');
    return { ok: true, message: 'Override recorded.', ...getResponse('/api/${group}/estimate/latest', req) };
  }
  if (path.includes('/blockers/resolve')) {
    const blocker = resolveBlocker();
    return { ok: true, message: blocker ? 'Blocker resolved.' : 'No open blockers.', blocker, ...getResponse('/api/${group}/risk/summary', req) };
  }
  if (path.includes('/artifacts/generate')) {
    generateArtifacts();
    return { ok: true, message: 'Artifacts generated.', ...getResponse('/api/${group}/artifacts', req) };
  }
  if (path.includes('/artifacts/approve')) {
    const artifact = approveArtifact(typeof body.artifactId === 'string' ? body.artifactId : undefined);
    return { ok: true, message: artifact ? \`\${artifact.name} approved.\` : 'No artifact available.', artifact, ...getResponse('/api/${group}/artifacts', req) };
  }
  if (path.includes('/artifacts/request-revision') || path.includes('/revisions/respond')) {
    const artifact = requestRevision(body);
    return { ok: true, message: artifact ? \`Revision requested for \${artifact.name}.\` : 'No artifact available.', artifact, ...getResponse('/api/${group}/artifacts', req) };
  }
  if (path.includes('/qa/run')) {
    runQa();
    return { ok: true, message: 'QA checks run.', ...getResponse('/api/${group}/qa/checks', req) };
  }
  if (path.includes('/session/role')) {
    state.role = typeof body.role === 'string' ? body.role : state.role;
    pushActivity('Role switched', state.role, 'role');
    return { ok: true, message: \`Role switched to \${state.role}.\`, role: state.role };
  }
  pushActivity('Dashboard action recorded', String(body.actionLabel ?? path), 'action');
  return { ok: true, message: 'Action recorded.', ...dashboardOverview(path) };
}

function handleEndpoint(method: string, path: string, req: Request) {
  return method === 'GET' ? getResponse(path, req) : postResponse(path, req);
}

${routes}

export default router;
`,
    });
  }

  // Also generate placeholder auth middleware
  files.push({
    path: "backend/middleware/auth.ts",
    content: `import type { NextFunction, Request, Response } from 'express';

export function authMiddleware(_req: Request, _res: Response, next: NextFunction) {
  // Placeholder auth — the backend specialist will implement real auth
  next();
}
`,
  });

  return files;
}

// ─── Cron/trigger install script ─────────────────────────────────────────────
// Generates a shell script that installs cron jobs via `openclaw cron add`.
// Called during setup after services are running.

function generateCronInstallScript(plan: ArchitecturePlan): ScaffoldFile | null {
  const triggers = plan.triggers ?? [];
  if (triggers.length === 0) return null;

  const commands = triggers.map((t) => {
    const trigger = t as { type?: string; name?: string; schedule?: string; skillId?: string; message?: string; every?: string; cron?: string };
    if (trigger.type !== 'cron') return null;

    const name = trigger.name ?? trigger.skillId ?? 'job';
    const schedule = trigger.cron ?? trigger.schedule ?? trigger.every ?? '0 */1 * * *'; // default: every hour
    const message = trigger.message ?? `Run ${trigger.skillId ?? name}`;

    // Determine if it's a cron expression or an interval
    const isCron = schedule.includes('*') || schedule.split(' ').length >= 5;
    const scheduleFlag = isCron ? `--cron "${schedule}"` : `--every "${schedule}"`;

    return `openclaw cron add --name "${name}" ${scheduleFlag} --message "${message.replace(/"/g, '\\"')}" --session isolated --json 2>/dev/null && echo "  ✅ ${name}" || echo "  ⚠️ ${name} (may already exist)"`;
  }).filter(Boolean);

  if (commands.length === 0) return null;

  return {
    path: ".openclaw/install-crons.sh",
    content: `#!/bin/sh
# Auto-generated cron job installer from architecture plan.
# Run after the gateway is healthy.
echo "Installing ${commands.length} scheduled job(s)..."
${commands.join('\n')}
echo "Done."
`,
  };
}

// ─── Master function ─────────────────────────────────────────────────────────

/**
 * Generate all scaffold files from the architecture plan.
 * Returns an array of {path, content} ready for workspace-writer.
 */
export function generateScaffoldFiles(
  rawPlan: ArchitecturePlan,
  agentName: string,
): ScaffoldFile[] {
  // Normalize: fill missing fields to prevent crashes from architect omissions
  const plan = normalizePlan(rawPlan as unknown as Record<string, unknown>);
  const backendEntry = generateBackendEntryFile(plan);
  const cronScript = generateCronInstallScript(plan);
  return [
    generatePackageJson(plan, agentName),
    generateDockerfile(),
    generateDockerCompose(plan, agentName),
    generateEnvExample(plan),
    generateTsconfig(),
    generateGitignore(),
    generateReadme(plan, agentName),
    generateSetupJson(plan),
    ...(backendEntry ? [backendEntry] : []),
    ...generatePlaceholderRoutes(plan),
    ...generateDashboardFiles(plan),
    ...(cronScript ? [cronScript] : []),
  ];
}
