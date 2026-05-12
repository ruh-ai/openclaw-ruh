/**
 * Deterministic preview-fixture generator.
 *
 * The architect can emit `previewFixtures` directly on the architecture
 * plan. When it doesn't, we synthesize fixtures from the plan's dashboard
 * pages and components so the prototype always renders representative
 * data — never empty boxes, never hardcoded domain placeholders.
 *
 * Same inputs always produce the same outputs. We use a small string
 * hash to pick column/row labels so different dataSources look different
 * but the same dataSource looks identical across re-renders.
 */

import type {
  ArchitecturePlan,
  ArtifactRecord,
  ArtifactStatus,
  DashboardPageComponent,
  PreviewFixtureMap,
  PreviewFixtureValue,
  TaskRunDetail,
  TaskStatus,
  TaskSummary,
  TimelineEvent,
  TimelineEventKind,
} from "./types";

const STATUS_POOL = ["active", "ready", "blocked", "in review", "done"];
const NOUN_POOL = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
];

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length];
}

function titleFromPath(path: string): string {
  const tail = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() ?? "item";
  return tail
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function singularize(noun: string): string {
  return noun.endsWith("ies")
    ? noun.slice(0, -3) + "y"
    : noun.endsWith("s") && !noun.endsWith("ss")
    ? noun.slice(0, -1)
    : noun;
}

function deriveColumns(
  comp: DashboardPageComponent | undefined,
  dataSource: string,
): string[] {
  const configColumns = (comp?.config as { columns?: unknown } | undefined)?.columns;
  if (Array.isArray(configColumns)) {
    const names = configColumns
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "field" in c && typeof (c as { field?: unknown }).field === "string") {
          return (c as { field: string }).field;
        }
        if (c && typeof c === "object" && "label" in c && typeof (c as { label?: unknown }).label === "string") {
          return (c as { label: string }).label;
        }
        return null;
      })
      .filter((v): v is string => Boolean(v));
    if (names.length > 0) return names.slice(0, 5);
  }
  // Generic columns derived from the dataSource label
  const noun = singularize(titleFromPath(dataSource));
  return [noun, "Owner", "Status", "Updated"];
}

function syntheticRows(
  comp: DashboardPageComponent | undefined,
  dataSource: string,
  rowCount = 4,
): Array<Record<string, unknown>> {
  const seed = hashString(dataSource);
  const columns = deriveColumns(comp, dataSource);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      const k = col.toLowerCase();
      if (k === "status" || k === "state") {
        row[col] = pick(STATUS_POOL, seed, i);
      } else if (k === "owner" || k === "assignee" || k === "user") {
        row[col] = pick(["Avery", "Jordan", "Sam", "Riley", "Casey"], seed, i);
      } else if (k === "updated" || k === "modified" || k === "timestamp" || k === "date") {
        row[col] = `${i + 1}h ago`;
      } else if (
        k === "value" ||
        k === "amount" ||
        k === "total" ||
        k === "count"
      ) {
        row[col] = ((seed + i * 17) % 90) + 10;
      } else {
        row[col] = `${pick(NOUN_POOL, seed, i)} ${i + 1}`;
      }
    }
    rows.push(row);
  }
  return rows;
}

function syntheticMetrics(
  comp: DashboardPageComponent | undefined,
  dataSource: string,
): Record<string, unknown> {
  const seed = hashString(dataSource);
  const configMetrics = (comp?.config as { metrics?: unknown } | undefined)?.metrics;
  if (Array.isArray(configMetrics) && configMetrics.length > 0) {
    const out: Record<string, unknown> = {};
    configMetrics.forEach((m, i) => {
      const label =
        typeof m === "string"
          ? m
          : m && typeof m === "object" && "label" in m
          ? String((m as { label: unknown }).label ?? `metric_${i}`)
          : `metric_${i}`;
      out[label] = ((seed + i * 23) % 90) + 10;
    });
    return out;
  }
  const base = titleFromPath(dataSource);
  return {
    [`Total ${base}`]: ((seed) % 90) + 10,
    Active: ((seed + 7) % 50) + 5,
    Blocked: ((seed + 13) % 8),
    "Pending review": ((seed + 19) % 12) + 1,
  };
}

function syntheticSeries(
  dataSource: string,
  size = 6,
): Array<{ label: string; value: number }> {
  const seed = hashString(dataSource);
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return Array.from({ length: size }).map((_, i) => ({
    label: labels[i] ?? `T${i + 1}`,
    value: ((seed + i * 11) % 80) + 20,
  }));
}

function fixtureForComponent(
  comp: DashboardPageComponent,
): PreviewFixtureValue {
  const ds = comp.dataSource;
  switch (comp.type) {
    case "metric-cards":
      return { metrics: syntheticMetrics(comp, ds) };
    case "data-table":
      return { items: syntheticRows(comp, ds, 5) };
    case "activity-feed":
      return {
        items: syntheticRows(comp, ds, 4).map((row, i) => ({
          id: `act-${i + 1}`,
          title: row[Object.keys(row)[0]] ?? `Event ${i + 1}`,
          description: row.Status ?? "Updated",
          timestamp: row.Updated ?? `${i + 1}h ago`,
        })),
      };
    case "bar-chart":
    case "line-chart":
    case "pie-chart":
      return { series: syntheticSeries(ds, 6) };
    case "status-badge":
    case "empty-state":
      return { items: syntheticRows(comp, ds, 3) };
    default:
      return { items: syntheticRows(comp, ds, 3) };
  }
}

function mergeFixture(
  existing: PreviewFixtureValue | undefined,
  next: PreviewFixtureValue,
): PreviewFixtureValue {
  if (!existing) return next;
  return {
    ...existing,
    ...next,
    items: existing.items ?? next.items,
    metrics: existing.metrics ?? next.metrics,
    series: existing.series ?? next.series,
  };
}

/**
 * Produce a complete fixture map for every dataSource referenced by the
 * plan. Architect-provided values win; missing keys are synthesized.
 */
export function synthesizeFixtures(plan: ArchitecturePlan | null | undefined): PreviewFixtureMap {
  const out: PreviewFixtureMap = {};
  if (!plan) return out;
  const seeded = plan.previewFixtures ?? {};
  for (const [key, value] of Object.entries(seeded)) {
    out[key] = { ...value };
  }
  const pages = plan.dashboardPages ?? [];
  for (const page of pages) {
    for (const comp of page.components ?? []) {
      if (!comp.dataSource) continue;
      // dataSource path may include query params; key off the path portion
      const key = comp.dataSource.split("?")[0];
      const synthetic = fixtureForComponent(comp);
      out[key] = mergeFixture(out[key], synthetic);
    }
  }
  return out;
}

export function fixtureFor(
  fixtures: PreviewFixtureMap,
  dataSource: string | undefined,
): PreviewFixtureValue | undefined {
  if (!dataSource) return undefined;
  return fixtures[dataSource.split("?")[0]];
}

// ── Task / timeline / artifact fixtures ────────────────────────────────────

const TASK_TITLE_NOUNS = [
  "Quarterly review",
  "Outreach batch",
  "Compliance check",
  "Stakeholder digest",
  "Anomaly investigation",
  "Onboarding follow-up",
  "Renewal preparation",
  "Performance summary",
];

const STATUS_ROTATION: TaskStatus[] = [
  "in_progress",
  "in_progress",
  "needs_approval",
  "blocked",
  "completed",
  "completed",
  "pending",
];

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function pipelineFromPlan(plan: ArchitecturePlan | null | undefined) {
  return plan?.dashboardPrototype?.pipeline ?? null;
}

function subAgentForStep(
  stepIndex: number,
  plan: ArchitecturePlan | null | undefined,
): string | undefined {
  const subs = plan?.subAgents ?? [];
  if (subs.length === 0) return undefined;
  return subs[stepIndex % subs.length]?.name;
}

function defaultStepNames(): string[] {
  return ["Intake", "Analyze", "Draft", "Review", "Publish"];
}

function buildTaskSummary(
  plan: ArchitecturePlan | null | undefined,
  index: number,
): TaskSummary {
  const seed = hashString(`task-${index}`);
  const status = STATUS_ROTATION[index % STATUS_ROTATION.length];
  const pipeline = pipelineFromPlan(plan);
  const stepNames = pipeline?.steps.map((s) => s.name) ?? defaultStepNames();
  const stepIds = pipeline?.steps.map((s) => s.id) ?? stepNames.map((_, i) => `step-${i + 1}`);
  // Approximate current step based on status; "completed" → past end; "pending" → none yet.
  let currentIndex: number;
  if (status === "pending") currentIndex = -1;
  else if (status === "completed") currentIndex = stepNames.length - 1;
  else currentIndex = (seed + index) % Math.max(1, stepNames.length - 1);

  const title = `${pick(TASK_TITLE_NOUNS, seed, index)} #${100 + index}`;
  const startedMinutes = 5 + ((seed + index * 11) % 240);
  return {
    id: `task-${1000 + index}`,
    title,
    status,
    pipelineId: pipeline?.name,
    startedAt: status === "pending" ? undefined : isoMinutesAgo(startedMinutes),
    updatedAt: isoMinutesAgo(Math.max(1, startedMinutes - 5)),
    completedAt: status === "completed" ? isoMinutesAgo(Math.max(0, startedMinutes - 30)) : undefined,
    assignedTo: subAgentForStep(Math.max(0, currentIndex), plan),
    currentStepId: currentIndex >= 0 ? stepIds[currentIndex] : undefined,
    currentStepName: currentIndex >= 0 ? stepNames[currentIndex] : undefined,
    inputs: { sample: pick(NOUN_POOL, seed, index) },
  };
}

function buildTimelineForTask(
  task: TaskSummary,
  plan: ArchitecturePlan | null | undefined,
  taskIndex: number,
): TimelineEvent[] {
  const pipeline = pipelineFromPlan(plan);
  const stepEntries =
    pipeline?.steps?.map((s, i) => ({ id: s.id, name: s.name, owner: s.owner ?? subAgentForStep(i, plan) })) ??
    defaultStepNames().map((n, i) => ({ id: `step-${i + 1}`, name: n, owner: subAgentForStep(i, plan) }));

  const events: TimelineEvent[] = [];
  const seed = hashString(task.id);
  const startedAt = task.startedAt ?? isoMinutesAgo(60);
  events.push({
    id: `${task.id}-input`,
    timestamp: startedAt,
    kind: "input",
    actor: "operator",
    label: `Task assigned: ${task.title}`,
    detail: `Input: ${JSON.stringify(task.inputs ?? {})}`,
  });

  const stopIndex = task.status === "completed"
    ? stepEntries.length
    : task.status === "pending"
      ? 0
      : (stepEntries.findIndex((s) => s.id === task.currentStepId) + 1) || 1;

  for (let i = 0; i < stopIndex; i++) {
    const step = stepEntries[i];
    if (!step) continue;
    const stepStart = isoMinutesAgo(50 - i * 8 - (seed % 5));
    events.push({
      id: `${task.id}-step-${i}-start`,
      timestamp: stepStart,
      kind: "step_started",
      stepId: step.id,
      stepName: step.name,
      actor: step.owner ?? "agent",
      label: `${step.name} started`,
    });
    // Sample tool call for variety
    if (i % 2 === 0) {
      events.push({
        id: `${task.id}-step-${i}-tool`,
        timestamp: isoMinutesAgo(48 - i * 8 - (seed % 4)),
        kind: "tool_call",
        stepId: step.id,
        stepName: step.name,
        actor: step.owner ?? "agent",
        label: `Called ${pick(["search", "summarize", "lookup", "draft"], seed, i)} tool`,
        toolName: pick(["search_records", "summarize_text", "fetch_data", "generate_draft"], seed, i),
        toolArgs: { query: pick(NOUN_POOL, seed, i + taskIndex) },
        toolResult: { ok: true, items: 3 + ((seed + i) % 12) },
      });
    }
    const completedAt = isoMinutesAgo(45 - i * 8 - (seed % 3));
    const isLast = i === stopIndex - 1 && task.status !== "completed";
    if (!isLast) {
      events.push({
        id: `${task.id}-step-${i}-end`,
        timestamp: completedAt,
        kind: "step_completed",
        stepId: step.id,
        stepName: step.name,
        actor: step.owner ?? "agent",
        label: `${step.name} completed`,
      });
    }
  }

  if (task.status === "needs_approval") {
    events.push({
      id: `${task.id}-approval-req`,
      timestamp: isoMinutesAgo(2),
      kind: "approval_requested",
      actor: "agent",
      label: "Operator approval requested",
      detail: "Review the generated artifact before publishing.",
    });
  }
  if (task.status === "blocked") {
    events.push({
      id: `${task.id}-error`,
      timestamp: isoMinutesAgo(3),
      kind: "error",
      actor: "agent",
      label: "Step blocked",
      detail: pick(
        [
          "Upstream API returned 429 — retrying with backoff",
          "Missing required input — operator review needed",
          "Auth profile expired — reconnect required",
        ],
        seed,
        taskIndex,
      ),
    });
  }
  if (task.status === "completed") {
    events.push({
      id: `${task.id}-complete`,
      timestamp: task.completedAt ?? isoMinutesAgo(1),
      kind: "complete",
      actor: "agent",
      label: "Task completed",
    });
  }

  return events;
}

function buildArtifactsForTask(
  task: TaskSummary,
  plan: ArchitecturePlan | null | undefined,
): ArtifactRecord[] {
  const planArtifacts = plan?.dashboardPrototype?.artifacts ?? [];
  const seed = hashString(task.id);
  const baseArtifacts = planArtifacts.length > 0
    ? planArtifacts
    : [
        {
          id: "summary",
          name: "Run summary",
          type: "summary",
          description: "Auto-generated summary of what this agent did.",
        },
      ];
  return baseArtifacts.slice(0, 2).map((a, i): ArtifactRecord => {
    let status: ArtifactStatus = "pending_review";
    if (task.status === "completed") status = "approved";
    else if (task.status === "needs_approval") status = "pending_review";
    else if (task.status === "blocked") status = "revision_requested";
    else status = "draft";
    return {
      id: `${task.id}-art-${i}`,
      taskId: task.id,
      name: a.name,
      type: a.type,
      status,
      createdAt: isoMinutesAgo(4 + i * 2),
      content:
        `# ${a.name}\n\n` +
        `${a.description ?? "Generated artifact for review."}\n\n` +
        `**Status:** ${status.replace("_", " ")}\n` +
        `**Run input:** ${pick(NOUN_POOL, seed, i)}\n\n` +
        `## Key findings\n` +
        `- Insight ${seed % 100}\n` +
        `- Insight ${(seed + 17) % 100}\n` +
        `- Insight ${(seed + 31) % 100}\n`,
      producedByStepId: task.currentStepId,
    };
  });
}

/**
 * Synthesize an end-to-end task fixture set for an agent: 6 tasks across
 * statuses, each with a derived timeline of pipeline activity and 1-2
 * artifacts. Powers the prototype's Tasks tab and the production
 * dashboard's day-1 Tasks page.
 */
export function synthesizeTaskRuns(
  plan: ArchitecturePlan | null | undefined,
): { tasks: TaskSummary[]; runs: Record<string, TaskRunDetail> } {
  const tasks: TaskSummary[] = [];
  const runs: Record<string, TaskRunDetail> = {};
  if (!plan) return { tasks, runs };
  for (let i = 0; i < 6; i++) {
    const task = buildTaskSummary(plan, i);
    tasks.push(task);
    runs[task.id] = {
      task,
      timeline: buildTimelineForTask(task, plan, i),
      artifacts: buildArtifactsForTask(task, plan),
    };
  }
  return { tasks, runs };
}
