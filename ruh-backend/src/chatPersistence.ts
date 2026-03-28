import type {
  PersistedBrowserTakeoverState,
  PersistedBrowserWorkspaceItem,
  PersistedBrowserWorkspaceState,
  PersistedTaskPlan,
  PersistedTaskPlanItem,
  PersistedTaskStep,
  PersistedTaskWorkspaceState,
  PersistedWorkspaceState,
} from './validation';

export interface PersistedChatExchangeMessage {
  role: string;
  content: string;
  workspace_state?: PersistedWorkspaceState;
}

interface BrowserWorkspaceEventLike {
  type: 'navigation' | 'action' | 'screenshot' | 'preview' | 'takeover_requested' | 'takeover_resumed';
  url?: string;
  label?: string;
  detail?: string;
  reason?: string;
  actionLabel?: string;
}

type TaskStatus = 'pending' | 'active' | 'done';

interface ActiveToolStepState {
  id: number;
  label: string;
  detail?: string;
  toolName?: string;
  startedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMessageContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (isRecord(entry) && typeof entry.text === 'string') return entry.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function getPersistedUserMessage(messages: unknown): PersistedChatExchangeMessage | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== 'user') {
      continue;
    }
    return {
      role: 'user',
      content: normalizeMessageContent(message.content),
    };
  }

  return null;
}

export function getPersistedAssistantMessageFromResponse(
  payload: unknown,
): PersistedChatExchangeMessage | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return null;
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null;
  }

  const role = typeof choice.message.role === 'string' ? choice.message.role : 'assistant';
  return {
    role,
    content: normalizeMessageContent(choice.message.content),
  };
}

function extractBrowserWorkspaceEvent(payload: unknown): BrowserWorkspaceEventLike | null {
  if (!isRecord(payload)) return null;

  const rawEvent = isRecord(payload.browser)
    ? payload.browser
    : isRecord(payload.browser_event)
      ? payload.browser_event
      : null;
  if (!rawEvent) return null;

  const rawType = rawEvent.type;
  if (
    rawType !== 'navigation'
    && rawType !== 'action'
    && rawType !== 'screenshot'
    && rawType !== 'preview'
    && rawType !== 'takeover_requested'
    && rawType !== 'takeover_resumed'
  ) {
    return null;
  }

  return {
    type: rawType,
    url: typeof rawEvent.url === 'string' ? rawEvent.url : undefined,
    label: typeof rawEvent.label === 'string' ? rawEvent.label : undefined,
    detail: typeof rawEvent.detail === 'string' ? rawEvent.detail : undefined,
    reason: typeof rawEvent.reason === 'string' ? rawEvent.reason : undefined,
    actionLabel: typeof rawEvent.actionLabel === 'string'
      ? rawEvent.actionLabel
      : typeof rawEvent.action_label === 'string'
        ? rawEvent.action_label
        : undefined,
  };
}

function isEmptyBrowserWorkspaceState(state: PersistedBrowserWorkspaceState | null): boolean {
  return !state || (
    (!state.items || state.items.length === 0)
    && !state.previewUrl
    && !state.takeover
  );
}

function isEmptyTaskWorkspaceState(state: PersistedTaskWorkspaceState | null): boolean {
  return !state || (!state.plan && (!state.steps || state.steps.length === 0));
}

function parseTaskCheckboxLines(lines: string[]): PersistedTaskPlanItem[] {
  let nextId = 1;
  const items: PersistedTaskPlanItem[] = [];
  let currentParent: PersistedTaskPlanItem | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trimEnd();
    if (!trimmed) continue;

    const match = trimmed.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (!match) continue;

    const item: PersistedTaskPlanItem = {
      id: nextId++,
      label: match[2].trim(),
      status: match[1].toLowerCase() === 'x' ? 'done' : 'pending',
    };

    const leadingSpaces = rawLine.length - rawLine.trimStart().length;
    if (leadingSpaces >= 2 && currentParent) {
      currentParent.children = [...(currentParent.children ?? []), item];
      continue;
    }

    currentParent = item;
    items.push(item);
  }

  return items;
}

function countTaskItems(items: PersistedTaskPlanItem[]): number {
  return items.reduce((count, item) => count + 1 + countTaskItems(item.children ?? []), 0);
}

function findCurrentTaskIndex(items: PersistedTaskPlanItem[]): number {
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].status !== 'done') {
      return index;
    }
  }
  return -1;
}

function activateFirstPending(items: PersistedTaskPlanItem[]): boolean {
  for (const item of items) {
    if (item.status === 'pending') {
      item.status = 'active';
      return true;
    }
    if (item.children && activateFirstPending(item.children)) {
      return true;
    }
  }
  return false;
}

function extractPersistedTaskPlan(content: string): PersistedTaskPlan | null {
  const explicitPlanMatch = content.match(/<plan>([\s\S]*?)<\/plan>/);
  const candidate = explicitPlanMatch
    ? explicitPlanMatch[1]
    : content.includes('<plan>')
      ? null
      : content;
  if (candidate == null) {
    return null;
  }

  const items = parseTaskCheckboxLines(candidate.split('\n'));
  if (items.length === 0) {
    return null;
  }
  if (!explicitPlanMatch && items.length < 2) {
    return null;
  }

  activateFirstPending(items);

  return {
    items,
    currentTaskIndex: findCurrentTaskIndex(items),
    totalTasks: countTaskItems(items),
  };
}

function applyBrowserWorkspaceEvent(
  state: PersistedBrowserWorkspaceState | null,
  event: BrowserWorkspaceEventLike,
  timestamp: number,
): PersistedBrowserWorkspaceState {
  const currentState: PersistedBrowserWorkspaceState = state ?? { items: [] };

  if (event.type === 'takeover_requested' || event.type === 'takeover_resumed') {
    const takeover: PersistedBrowserTakeoverState = {
      status: event.type === 'takeover_requested' ? 'requested' : 'resumed',
      reason: event.reason ?? (
        event.type === 'takeover_requested'
          ? 'Operator input is needed to continue the browser run'
          : 'Operator resumed the browser run'
      ),
      actionLabel: event.actionLabel ?? (
        event.type === 'takeover_requested'
          ? 'Resume agent run'
          : 'Agent resumed'
      ),
      updatedAt: timestamp,
    };

    return {
      ...currentState,
      takeover,
    };
  }

  const items = currentState.items ?? [];
  const nextItem: PersistedBrowserWorkspaceItem = {
    id: items.length,
    kind: event.type,
    label: event.label ?? event.url ?? event.type,
    detail: event.detail,
    url: event.url,
    timestamp,
  };

  return {
    items: [...items, nextItem],
    previewUrl: event.type === 'preview' && event.url ? event.url : currentState.previewUrl,
    takeover: currentState.takeover,
  };
}

export class StreamingChatPersistenceCollector {
  private currentEvent = '';
  private assistantContent = '';
  private browserState: PersistedBrowserWorkspaceState | null = null;
  private taskSteps: PersistedTaskStep[] = [];
  private activeToolStep: ActiveToolStepState | null = null;
  private nextStepId = 0;
  private sawDone = false;

  constructor(
    private readonly now: () => number = () => Date.now(),
  ) {}

  consumeLine(line: string): { sawDone: boolean } {
    if (line.startsWith('event: ')) {
      this.currentEvent = line.slice(7).trim();
      return { sawDone: false };
    }

    if (!line.startsWith('data: ')) {
      return { sawDone: false };
    }

    const raw = line.slice(6).trim();
    if (raw === '[DONE]') {
      this.finishActiveToolStep();
      this.sawDone = true;
      this.currentEvent = '';
      return { sawDone: true };
    }

    try {
      const parsed = JSON.parse(raw);

      if (this.currentEvent === 'tool_start') {
        this.finishActiveToolStep();
        this.startToolStep(parsed);
        this.currentEvent = '';
        return { sawDone: false };
      }

      if (this.currentEvent === 'tool_end') {
        this.finishActiveToolStep();
        this.currentEvent = '';
        return { sawDone: false };
      }

      const browserEvent = extractBrowserWorkspaceEvent(parsed);
      if (browserEvent) {
        this.browserState = applyBrowserWorkspaceEvent(this.browserState, browserEvent, this.now());
      }

      if ((parsed.tool || parsed.name) && !parsed.choices) {
        this.finishActiveToolStep();
        this.startToolStep(parsed);
      }

      const delta = isRecord(parsed)
        ? (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0]?.delta
        : undefined;
      const deltaContent = isRecord(delta) ? normalizeMessageContent(delta.content) : '';
      if (deltaContent) {
        this.assistantContent += deltaContent;
      }
    } catch {
      // Ignore malformed non-JSON fragments so the relay can keep streaming.
    }

    this.currentEvent = '';
    return { sawDone: false };
  }

  hasCompleted(): boolean {
    return this.sawDone;
  }

  private startToolStep(payload: unknown) {
    if (!isRecord(payload)) {
      return;
    }

    const toolName = typeof payload.tool === 'string'
      ? payload.tool
      : typeof payload.name === 'string'
        ? payload.name
        : 'tool';
    const detail = typeof payload.input === 'string'
      ? payload.input
      : payload.input
        ? JSON.stringify(payload.input)
        : typeof payload.command === 'string'
          ? payload.command
          : typeof payload.arguments === 'string'
            ? payload.arguments
            : undefined;

    this.activeToolStep = {
      id: this.nextStepId++,
      label: toolName,
      detail,
      toolName,
      startedAt: this.now(),
    };
  }

  private finishActiveToolStep() {
    if (!this.activeToolStep) {
      return;
    }

    this.taskSteps.push({
      id: this.activeToolStep.id,
      kind: 'tool',
      label: this.activeToolStep.label,
      detail: this.activeToolStep.detail,
      toolName: this.activeToolStep.toolName,
      status: 'done',
      startedAt: this.activeToolStep.startedAt,
      elapsedMs: Math.max(0, this.now() - this.activeToolStep.startedAt),
    });
    this.activeToolStep = null;
  }

  buildAssistantMessage(): PersistedChatExchangeMessage | null {
    if (!this.sawDone) {
      return null;
    }

    const taskPlan = extractPersistedTaskPlan(this.assistantContent);
    const taskState: PersistedTaskWorkspaceState | null = isEmptyTaskWorkspaceState({
      plan: taskPlan ?? undefined,
      steps: this.taskSteps.length > 0 ? this.taskSteps : undefined,
    })
      ? null
      : {
        plan: taskPlan ?? undefined,
        steps: this.taskSteps.length > 0 ? this.taskSteps : undefined,
      };

    const workspace_state = isEmptyBrowserWorkspaceState(this.browserState) && !taskState
      ? undefined
      : {
        version: 1 as const,
        browser: this.browserState ?? undefined,
        task: taskState ?? undefined,
      };

    return {
      role: 'assistant',
      content: this.assistantContent,
      workspace_state,
    };
  }
}
