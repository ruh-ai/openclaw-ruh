import type {
  ArchitecturePlan,
  DashboardPrototypeAction,
  DashboardPrototypeArtifact,
  DashboardPrototypePipeline,
  DashboardPrototypePipelineStep,
  DashboardPageComponent,
  DashboardPrototypeWorkflow,
  SubAgentConfig,
} from "./types";

export interface DashboardPrototypePageModel {
  path: string;
  title: string;
  purpose: string;
  components: DashboardPageComponent["type"][];
  workflows: DashboardPrototypeWorkflow[];
  actions: string[];
  acceptanceCriteria: string[];
}

export interface DashboardPrototypeSubAgentModel {
  id: string;
  name: string;
  type: SubAgentConfig["type"];
  skills: string[];
  trigger: string;
  autonomy: string;
  description: string;
}

export interface DashboardPrototypeActionModel extends DashboardPrototypeAction {
  label: string;
}

export interface DashboardPrototypePipelineModel {
  name: string;
  triggerActionId: string | null;
  steps: DashboardPrototypePipelineStep[];
  completionCriteria: string[];
  failureStates: string[];
}

export interface DashboardPrototypeArtifactModel extends DashboardPrototypeArtifact {
  reviewActions: string[];
  acceptanceCriteria: string[];
}

export interface DashboardPrototypeViewModel {
  ready: boolean;
  blocker: string | null;
  summary: string;
  primaryUsers: string[];
  pages: DashboardPrototypePageModel[];
  actions: DashboardPrototypeActionModel[];
  primaryActions: DashboardPrototypeActionModel[];
  pipeline: DashboardPrototypePipelineModel | null;
  artifacts: DashboardPrototypeArtifactModel[];
  emptyState: string;
  revisionPrompts: string[];
  approvalChecklist: string[];
  subAgents: DashboardPrototypeSubAgentModel[];
}

function normalizePath(path: string | undefined, fallback: string): string {
  const value = path?.trim() || fallback;
  return value.startsWith("/") ? value : `/${value}`;
}

function slugify(value: string, fallback: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function formatActionLabel(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferActionType(value: string): DashboardPrototypeAction["type"] {
  const lower = value.toLowerCase();
  if (lower.includes("create") || lower.includes("new")) return "create";
  if (lower.includes("run") || lower.includes("start") || lower.includes("pipeline")) return "run_pipeline";
  if (lower.includes("approve")) return "approve";
  if (lower.includes("revision") || lower.includes("revise")) return "request_revision";
  if (lower.includes("blocker") || lower.includes("resolve")) return "resolve_blocker";
  if (lower.includes("publish") || lower.includes("archive")) return "publish";
  return "other";
}

function fallbackActions(workflows: DashboardPrototypeWorkflow[], pages: DashboardPrototypePageModel[]): DashboardPrototypeActionModel[] {
  const actionLabels = new Set<string>();
  for (const page of pages) {
    for (const action of page.actions) actionLabels.add(action);
  }
  for (const workflow of workflows) {
    for (const action of workflow.requiredActions) actionLabels.add(action);
  }
  if (actionLabels.size === 0 && pages.length > 0) {
    actionLabels.add("Create work item");
    actionLabels.add("Run pipeline");
  }
  return Array.from(actionLabels).map((label, index) => ({
    id: slugify(label, `action-${index + 1}`),
    label: formatActionLabel(label),
    type: inferActionType(label),
    primary: index < 2,
  }));
}

function fallbackPipeline(
  explicitPipeline: DashboardPrototypePipeline | undefined,
  workflows: DashboardPrototypeWorkflow[],
): DashboardPrototypePipelineModel | null {
  if (explicitPipeline && explicitPipeline.steps.length > 0) {
    return {
      name: explicitPipeline.name,
      triggerActionId: explicitPipeline.triggerActionId ?? null,
      steps: explicitPipeline.steps,
      completionCriteria: explicitPipeline.completionCriteria,
      failureStates: explicitPipeline.failureStates,
    };
  }
  const workflow = workflows[0];
  if (!workflow || workflow.steps.length === 0) return null;
  return {
    name: `${workflow.name} pipeline`,
    triggerActionId: null,
    steps: workflow.steps.map((step, index) => ({
      id: slugify(step, `step-${index + 1}`),
      name: step,
    })),
    completionCriteria: workflow.successCriteria,
    failureStates: ["Blocked prerequisite", "Missing required evidence"],
  };
}

function fallbackArtifacts(
  explicitArtifacts: DashboardPrototypeArtifact[] | undefined,
  hasDashboard: boolean,
): DashboardPrototypeArtifactModel[] {
  if (explicitArtifacts && explicitArtifacts.length > 0) {
    return explicitArtifacts.map((artifact) => ({
      ...artifact,
      reviewActions: artifact.reviewActions ?? [],
      acceptanceCriteria: artifact.acceptanceCriteria ?? [],
    }));
  }
  if (!hasDashboard) return [];
  return [
    {
      id: "work-summary",
      name: "Work summary",
      type: "summary",
      description: "Generated summary artifact for the operator to inspect before approval.",
      reviewActions: ["approve_artifact", "request_revision"],
      acceptanceCriteria: ["Summary reflects the latest pipeline state"],
    },
    {
      id: "approval-package",
      name: "Approval package",
      type: "approval",
      description: "Final package assembled after pipeline checks pass.",
      reviewActions: ["approve_package", "request_revision"],
      acceptanceCriteria: ["Package cannot be approved while blockers remain"],
    },
  ];
}

export function buildDashboardPrototypeViewModel(plan: ArchitecturePlan | null | undefined): DashboardPrototypeViewModel {
  const dashboardPages = plan?.dashboardPages ?? [];
  const prototype = plan?.dashboardPrototype;
  const hasDashboard = dashboardPages.length > 0;
  const ready = Boolean(
    !hasDashboard
      || (
        prototype
        && prototype.summary
        && prototype.workflows.length > 0
        && prototype.pages.length > 0
      ),
  );

  const workflows = prototype?.workflows ?? [];
  const pages = dashboardPages.length > 0
    ? dashboardPages.map((plannedPage, index): DashboardPrototypePageModel => {
      const path = normalizePath(plannedPage.path, `/page-${index + 1}`);
      const prototypePage = prototype?.pages.find((page) => normalizePath(page.path, path) === path);
      const workflowIds = new Set(prototypePage?.supportsWorkflows ?? []);
      const pageWorkflows = workflows.filter((workflow) => workflowIds.has(workflow.id));
      return {
        path,
        title: prototypePage?.title || plannedPage.title || `Page ${index + 1}`,
        purpose: prototypePage?.purpose || plannedPage.description || plannedPage.title || "Review planned dashboard behavior.",
        components: (plannedPage.components ?? []).map((component) => component.type),
        workflows: pageWorkflows.length > 0 ? pageWorkflows : workflows,
        actions: prototypePage?.requiredActions ?? [],
        acceptanceCriteria: prototypePage?.acceptanceCriteria ?? [],
      };
    })
    : (prototype?.pages ?? []).map((page, index): DashboardPrototypePageModel => {
      const workflowIds = new Set(page.supportsWorkflows ?? []);
      return {
        path: normalizePath(page.path, `/page-${index + 1}`),
        title: page.title,
        purpose: page.purpose,
        components: [],
        workflows: workflows.filter((workflow) => workflowIds.has(workflow.id)),
        actions: page.requiredActions,
        acceptanceCriteria: page.acceptanceCriteria,
      };
    });

  const actions = (prototype?.actions && prototype.actions.length > 0)
    ? prototype.actions
    : fallbackActions(workflows, pages);
  const primaryActions = actions.filter((action) =>
    action.primary || action.type === "create" || action.type === "run_pipeline"
  );
  const pipeline = fallbackPipeline(prototype?.pipeline, workflows);
  const artifacts = fallbackArtifacts(prototype?.artifacts, hasDashboard);

  return {
    ready,
    blocker: ready ? null : "dashboardPrototype is required before Build can start.",
    summary: prototype?.summary ?? "No dashboard prototype is required for this agent.",
    primaryUsers: prototype?.primaryUsers ?? [],
    pages,
    actions,
    primaryActions: primaryActions.length > 0 ? primaryActions : actions.slice(0, 2),
    pipeline,
    artifacts,
    emptyState: prototype?.emptyState ?? "Create a sample work item to validate the dashboard workflow before Build starts.",
    revisionPrompts: prototype?.revisionPrompts ?? [],
    approvalChecklist: prototype?.approvalChecklist ?? [],
    subAgents: (plan?.subAgents ?? []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      skills: agent.skills,
      trigger: agent.trigger,
      autonomy: agent.autonomy.replace(/_/g, " "),
      description: agent.description,
    })),
  };
}
