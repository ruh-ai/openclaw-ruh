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
