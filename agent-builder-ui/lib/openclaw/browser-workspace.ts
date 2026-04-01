import type { TaskPlan, TaskPlanItem } from "./task-plan-parser";

export type BrowserWorkspaceEventType =
  | "navigation"
  | "action"
  | "screenshot"
  | "preview"
  | "takeover_requested"
  | "takeover_resumed";

export interface BrowserWorkspaceEvent {
  type: BrowserWorkspaceEventType;
  url?: string;
  label?: string;
  detail?: string;
  reason?: string;
  actionLabel?: string;
}

export type BrowserWorkspaceItemKind =
  | "navigation"
  | "action"
  | "screenshot"
  | "preview";

export interface BrowserWorkspaceItem {
  id: number;
  kind: BrowserWorkspaceItemKind;
  url?: string;
  label: string;
  detail?: string;
  timestamp: number;
}

export interface BrowserTakeoverState {
  status: "requested" | "resumed";
  reason: string;
  actionLabel: string;
  updatedAt: number;
}

export interface BrowserWorkspaceState {
  items: BrowserWorkspaceItem[];
  previewUrl: string | null;
  takeover: BrowserTakeoverState | null;
}

export interface PersistedWorkspaceState {
  version: 1;
  browser?: BrowserWorkspaceState;
  task?: PersistedTaskWorkspaceState;
}

export interface PersistedTaskStep {
  id: number;
  kind: "thinking" | "tool" | "writing";
  label: string;
  detail?: string;
  toolName?: string;
  status: "active" | "done";
  startedAt: number;
  elapsedMs?: number;
}

export interface PersistedTaskWorkspaceState {
  plan?: TaskPlan;
  steps?: PersistedTaskStep[];
}

export interface ExtractedPersistedWorkspaceState {
  browserState?: BrowserWorkspaceState;
  taskPlan?: TaskPlan;
  steps?: PersistedTaskStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createEmptyBrowserWorkspaceState(): BrowserWorkspaceState {
  return {
    items: [],
    previewUrl: null,
    takeover: null,
  };
}

function isBrowserWorkspaceItemKind(value: unknown): value is BrowserWorkspaceItemKind {
  return value === "navigation" || value === "action" || value === "screenshot" || value === "preview";
}

function isTakeoverStatus(value: unknown): value is BrowserTakeoverState["status"] {
  return value === "requested" || value === "resumed";
}

function isEmptyBrowserWorkspaceState(state: BrowserWorkspaceState | null | undefined): boolean {
  return !state || (
    state.items.length === 0
    && !state.previewUrl
    && !state.takeover
  );
}

function isTaskStatus(value: unknown): value is TaskPlanItem["status"] {
  return value === "pending" || value === "active" || value === "done";
}

function isStepKind(value: unknown): value is PersistedTaskStep["kind"] {
  return value === "thinking" || value === "tool" || value === "writing";
}

function isStepStatus(value: unknown): value is PersistedTaskStep["status"] {
  return value === "active" || value === "done";
}

function isEmptyTaskWorkspaceState(state: PersistedTaskWorkspaceState | null | undefined): boolean {
  return !state || (!state.plan && (!state.steps || state.steps.length === 0));
}

function extractTaskPlanItem(payload: unknown): TaskPlanItem {
  if (!isRecord(payload)) {
    throw new Error("invalid-task-plan-item");
  }

  const { id, label, status, children } = payload;
  if (
    typeof id !== "number"
    || !Number.isInteger(id)
    || id < 0
    || typeof label !== "string"
    || !isTaskStatus(status)
  ) {
    throw new Error("invalid-task-plan-item");
  }

  return {
    id,
    label,
    status,
    children: Array.isArray(children)
      ? children.map((child) => extractTaskPlanItem(child))
      : undefined,
  };
}

function extractTaskWorkspaceState(payload: unknown): PersistedTaskWorkspaceState | null {
  if (!isRecord(payload)) {
    return null;
  }

  const rawTask = payload.task;
  if (rawTask === undefined) {
    return null;
  }
  if (!isRecord(rawTask)) {
    return null;
  }

  const rawPlan = rawTask.plan;
  const plan = rawPlan === undefined
    ? undefined
    : (() => {
      if (!isRecord(rawPlan)) {
        throw new Error("invalid-task-plan");
      }
      const { items, currentTaskIndex, totalTasks } = rawPlan;
      if (
        !Array.isArray(items)
        || typeof currentTaskIndex !== "number"
        || !Number.isInteger(currentTaskIndex)
        || typeof totalTasks !== "number"
        || !Number.isInteger(totalTasks)
      ) {
        throw new Error("invalid-task-plan");
      }

      return {
        items: items.map((item) => extractTaskPlanItem(item)),
        currentTaskIndex,
        totalTasks,
      };
    })();

  const rawSteps = rawTask.steps;
  const steps = rawSteps === undefined
    ? undefined
    : (() => {
      if (!Array.isArray(rawSteps)) {
        throw new Error("invalid-task-steps");
      }
      return rawSteps.map((step) => {
        if (!isRecord(step)) {
          throw new Error("invalid-task-step");
        }
        const { id, kind, label, detail, toolName, status, startedAt, elapsedMs } = step;
        if (
          typeof id !== "number"
          || !Number.isInteger(id)
          || id < 0
          || !isStepKind(kind)
          || typeof label !== "string"
          || !isStepStatus(status)
          || typeof startedAt !== "number"
          || !Number.isInteger(startedAt)
          || startedAt < 0
          || (detail !== undefined && typeof detail !== "string")
          || (toolName !== undefined && typeof toolName !== "string")
          || (elapsedMs !== undefined && (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0))
        ) {
          throw new Error("invalid-task-step");
        }

        return {
          id,
          kind,
          label,
          detail,
          toolName,
          status,
          startedAt,
          elapsedMs,
        };
      });
    })();

  if (!plan && (!steps || steps.length === 0)) {
    return null;
  }

  return {
    plan,
    steps,
  };
}

export function toPersistedWorkspaceState(
  browserState: BrowserWorkspaceState | null | undefined,
  taskState?: PersistedTaskWorkspaceState | null,
): PersistedWorkspaceState | undefined {
  if (isEmptyBrowserWorkspaceState(browserState) && isEmptyTaskWorkspaceState(taskState)) {
    return undefined;
  }

  return {
    version: 1,
    browser: browserState ?? undefined,
    task: taskState ?? undefined,
  };
}

export function extractBrowserWorkspaceState(payload: unknown): BrowserWorkspaceState | null {
  try {
    if (!isRecord(payload)) return null;
    if (payload.version !== 1) return null;

    const rawBrowser = payload.browser;
    if (!isRecord(rawBrowser)) return null;

    const rawItems = rawBrowser.items;
    if (rawItems !== undefined && !Array.isArray(rawItems)) {
      return null;
    }

    const items: BrowserWorkspaceItem[] = Array.isArray(rawItems)
      ? rawItems.map((item) => {
        if (!isRecord(item)) {
          throw new Error("invalid-browser-item");
        }

        const id = item.id;
        const kind = item.kind;
        const label = item.label;
        const timestamp = item.timestamp;

        if (
          typeof id !== "number"
          || !Number.isInteger(id)
          || id < 0
          || !isBrowserWorkspaceItemKind(kind)
          || typeof label !== "string"
          || typeof timestamp !== "number"
          || !Number.isInteger(timestamp)
          || timestamp < 0
        ) {
          throw new Error("invalid-browser-item");
        }

        return {
          id,
          kind,
          label,
          detail: typeof item.detail === "string" ? item.detail : undefined,
          url: typeof item.url === "string" ? item.url : undefined,
          timestamp,
        };
      })
      : [];

    const rawTakeover = rawBrowser.takeover;
    let takeover: BrowserTakeoverState | null = null;
    if (rawTakeover !== undefined && rawTakeover !== null) {
      if (!isRecord(rawTakeover)) return null;
      if (
        !isTakeoverStatus(rawTakeover.status)
        || typeof rawTakeover.reason !== "string"
        || typeof rawTakeover.actionLabel !== "string"
        || typeof rawTakeover.updatedAt !== "number"
        || !Number.isInteger(rawTakeover.updatedAt)
        || rawTakeover.updatedAt < 0
      ) {
        return null;
      }

      takeover = {
        status: rawTakeover.status,
        reason: rawTakeover.reason,
        actionLabel: rawTakeover.actionLabel,
        updatedAt: rawTakeover.updatedAt,
      };
    }

    return {
      items,
      previewUrl: typeof rawBrowser.previewUrl === "string" ? rawBrowser.previewUrl : null,
      takeover,
    };
  } catch {
    return null;
  }
}

export function extractPersistedWorkspaceState(
  payload: unknown,
): ExtractedPersistedWorkspaceState | null {
  if (!isRecord(payload) || payload.version !== 1) {
    return null;
  }

  try {
    const browserState = extractBrowserWorkspaceState(payload) ?? undefined;
    const taskState = extractTaskWorkspaceState(payload);
    return {
      browserState,
      taskPlan: taskState?.plan,
      steps: taskState?.steps,
    };
  } catch {
    return null;
  }
}

export function extractBrowserWorkspaceEvent(payload: unknown): BrowserWorkspaceEvent | null {
  if (!isRecord(payload)) return null;

  const rawEvent = isRecord(payload.browser) ? payload.browser : isRecord(payload.browser_event) ? payload.browser_event : null;
  if (!rawEvent) return null;

  const rawType = rawEvent.type;
  if (typeof rawType !== "string") return null;

  const type = rawType as BrowserWorkspaceEventType;
  if (![
    "navigation",
    "action",
    "screenshot",
    "preview",
    "takeover_requested",
    "takeover_resumed",
  ].includes(type)) {
    return null;
  }

  return {
    type,
    url: typeof rawEvent.url === "string" ? rawEvent.url : undefined,
    label: typeof rawEvent.label === "string" ? rawEvent.label : undefined,
    detail: typeof rawEvent.detail === "string" ? rawEvent.detail : undefined,
    reason: typeof rawEvent.reason === "string" ? rawEvent.reason : undefined,
    actionLabel: typeof rawEvent.actionLabel === "string"
      ? rawEvent.actionLabel
      : typeof rawEvent.action_label === "string"
        ? rawEvent.action_label
        : undefined,
  };
}

export function applyBrowserWorkspaceEvent(
  state: BrowserWorkspaceState,
  event: BrowserWorkspaceEvent,
  timestamp = Date.now(),
): BrowserWorkspaceState {
  if (event.type === "takeover_requested" || event.type === "takeover_resumed") {
    const fallbackReason = event.type === "takeover_requested"
      ? "Operator input is needed to continue the browser run"
      : "Operator resumed the browser run";
    const fallbackAction = event.type === "takeover_requested"
      ? "Resume agent run"
      : "Agent resumed";

    return {
      ...state,
      takeover: {
        status: event.type === "takeover_requested" ? "requested" : "resumed",
        reason: event.reason ?? fallbackReason,
        actionLabel: event.actionLabel ?? fallbackAction,
        updatedAt: timestamp,
      },
    };
  }

  const nextItem: BrowserWorkspaceItem = {
    id: state.items.length,
    kind: event.type,
    url: event.url,
    label: event.label ?? event.url ?? event.type,
    detail: event.detail,
    timestamp,
  };

  return {
    items: [...state.items, nextItem],
    previewUrl: event.type === "preview" && event.url ? event.url : state.previewUrl,
    takeover: state.takeover,
  };
}
