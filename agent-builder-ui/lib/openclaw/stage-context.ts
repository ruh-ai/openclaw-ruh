import type { AgentDevStage, StageStatus } from "./types";

export type ChatMode = "ask" | "revise" | "debug" | "approve";

export type ArtifactKind =
  | "research"
  | "prd"
  | "trd"
  | "plan"
  | "build_report"
  | "review"
  | "test_report";

export type StageAction =
  | "ask"
  | "request_changes"
  | "approve"
  | "regenerate"
  | "compare"
  | "debug"
  | "retry_build"
  | "run_test"
  | "ship";

export type BuildReadiness = "blocked" | "test-ready" | "ship-ready";

export interface ArtifactTarget {
  kind: ArtifactKind;
  path?: string;
  section?: string;
}

export interface StageContextInput {
  devStage: AgentDevStage;
  thinkStatus: StageStatus;
  planStatus: StageStatus;
  buildStatus: StageStatus;
  deployStatus: StageStatus;
  discoveryDocuments: unknown;
  architecturePlan: unknown;
  buildManifest: unknown;
  buildReport: null | { readiness?: BuildReadiness; checks?: unknown[] };
  selectedArtifact: ArtifactTarget | null;
}

export interface StageContext {
  stage: AgentDevStage;
  mode: ChatMode;
  primaryArtifact: ArtifactTarget | null;
  readiness: "draft" | "blocked" | "ready" | "test-ready" | "ship-ready";
  allowedActions: StageAction[];
}

const APPROVABLE_STATUSES = new Set<StageStatus>(["ready", "done", "approved"]);

function hasUsablePlanLike(plan: unknown): boolean {
  if (!plan || typeof plan !== "object") return false;
  const candidate = plan as {
    skills?: unknown[];
    workflow?: { steps?: unknown[] };
  };
  return (candidate.skills?.length ?? 0) > 0 || (candidate.workflow?.steps?.length ?? 0) > 0;
}

function hasRequiredDashboardPrototypeLike(plan: unknown): boolean {
  if (!plan || typeof plan !== "object") return true;
  const candidate = plan as {
    dashboardPages?: unknown[];
    dashboardPrototype?: {
      summary?: unknown;
      workflows?: unknown[];
      pages?: unknown[];
    };
  };
  if ((candidate.dashboardPages?.length ?? 0) === 0) return true;
  const prototype = candidate.dashboardPrototype;
  return Boolean(
    prototype
      && typeof prototype.summary === "string"
      && prototype.summary.trim().length > 0
      && (prototype.workflows?.length ?? 0) > 0
      && (prototype.pages?.length ?? 0) > 0,
  );
}

function resolveReadiness(input: StageContextInput): StageContext["readiness"] {
  const reportReadiness = input.buildReport?.readiness;
  if (reportReadiness) return reportReadiness;

  if (input.devStage === "build" && input.buildStatus === "done") return "ready";
  if (input.devStage === "think" && APPROVABLE_STATUSES.has(input.thinkStatus)) return "ready";
  if (input.devStage === "plan" && APPROVABLE_STATUSES.has(input.planStatus) && hasUsablePlanLike(input.architecturePlan)) return "ready";
  if (input.devStage === "prototype" && hasUsablePlanLike(input.architecturePlan)) {
    return hasRequiredDashboardPrototypeLike(input.architecturePlan) ? "ready" : "blocked";
  }
  return "draft";
}

function resolveMode(input: StageContextInput, readiness: StageContext["readiness"]): ChatMode {
  if (input.selectedArtifact) return "revise";
  if (input.devStage === "build" || readiness === "blocked") return "debug";
  if (input.devStage === "ship" && readiness === "ship-ready") return "approve";
  return "ask";
}

export function resolveStageContext(input: StageContextInput): StageContext {
  const allowed = new Set<StageAction>(["ask"]);
  const readiness = resolveReadiness(input);

  if (input.selectedArtifact) {
    allowed.add("request_changes");
    allowed.add("compare");
    allowed.add("regenerate");
  }

  if (input.devStage === "think" && APPROVABLE_STATUSES.has(input.thinkStatus)) {
    allowed.add("approve");
  }

  if (input.devStage === "plan" && APPROVABLE_STATUSES.has(input.planStatus) && hasUsablePlanLike(input.architecturePlan)) {
    allowed.add("approve");
  }

  if (input.devStage === "prototype" && readiness === "ready") {
    allowed.add("approve");
    allowed.add("request_changes");
  }

  if (input.devStage === "build") {
    allowed.add("debug");
    allowed.add("retry_build");
    if (input.buildStatus === "done" && readiness !== "blocked") allowed.add("approve");
  }

  if (input.devStage === "test" && (readiness === "test-ready" || readiness === "ship-ready")) {
    allowed.add("run_test");
  }

  if (input.devStage === "ship" && readiness === "ship-ready") {
    allowed.add("ship");
  }

  return {
    stage: input.devStage,
    mode: resolveMode(input, readiness),
    primaryArtifact: input.selectedArtifact,
    readiness,
    allowedActions: Array.from(allowed),
  };
}
