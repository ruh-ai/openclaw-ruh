/**
 * Task Plan Parser — pure functions to extract structured task plans
 * from agent streamed responses.
 *
 * Supports two formats:
 * 1. XML plan blocks: <plan>- [ ] Task 1\n- [ ] Task 2</plan>
 * 2. Markdown checkbox lists: - [ ] / - [x] as fallback
 * 3. Task updates: <task_update index="N" status="done"/>
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskPlanItem {
  id: number;
  label: string;
  status: "pending" | "active" | "done";
  children?: TaskPlanItem[];
}

export interface TaskPlan {
  items: TaskPlanItem[];
  currentTaskIndex: number; // index of first non-done top-level item (-1 if all done)
  totalTasks: number;       // flat count including children
}

export interface TaskUpdateEvent {
  index: number;
  status: "done" | "active" | "pending";
}

// ─── Internal helpers ───────────────────────────────────────────────────────

let nextPlanItemId = 1;

function resetIdCounter() {
  nextPlanItemId = 1;
}

function countTasks(items: TaskPlanItem[]): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (item.children) count += countTasks(item.children);
  }
  return count;
}

function findCurrentIndex(items: TaskPlanItem[]): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].status !== "done") return i;
  }
  return -1;
}

/**
 * Parse lines of markdown checkbox syntax into TaskPlanItem[].
 * Supports one level of nesting (2-space or 4-space indent).
 */
function parseCheckboxLines(lines: string[]): TaskPlanItem[] {
  const items: TaskPlanItem[] = [];
  let currentParent: TaskPlanItem | null = null;

  for (const raw of lines) {
    const trimmed = raw.trimEnd();
    if (!trimmed) continue;

    // Detect indent level
    const leadingSpaces = raw.length - raw.trimStart().length;
    const isChild = leadingSpaces >= 2;

    // Match checkbox: - [ ] or - [x] or - [X] (with optional leading whitespace)
    const match = trimmed.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (!match) continue;

    const isDone = match[1].toLowerCase() === "x";
    const label = match[2].trim();

    const item: TaskPlanItem = {
      id: nextPlanItemId++,
      label,
      status: isDone ? "done" : "pending",
    };

    if (isChild && currentParent) {
      if (!currentParent.children) currentParent.children = [];
      currentParent.children.push(item);
    } else {
      currentParent = item;
      items.push(item);
    }
  }

  return items;
}

/**
 * After parsing, mark the first non-done item as "active".
 */
function activateFirstPending(items: TaskPlanItem[]): void {
  for (const item of items) {
    if (item.status === "pending") {
      item.status = "active";
      return;
    }
    if (item.children) {
      for (const child of item.children) {
        if (child.status === "pending") {
          child.status = "active";
          return;
        }
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a `<plan>...</plan>` XML block from the streamed text.
 * Returns null if no complete plan block is found.
 */
export function parseTaskPlanBlock(text: string): TaskPlan | null {
  const openTag = "<plan>";
  const closeTag = "</plan>";

  const startIdx = text.indexOf(openTag);
  if (startIdx === -1) return null;

  const contentStart = startIdx + openTag.length;
  const endIdx = text.indexOf(closeTag, contentStart);
  if (endIdx === -1) return null; // plan block not closed yet

  const planContent = text.slice(contentStart, endIdx);
  const lines = planContent.split("\n");

  resetIdCounter();
  const items = parseCheckboxLines(lines);
  if (items.length === 0) return null;

  activateFirstPending(items);

  return {
    items,
    currentTaskIndex: findCurrentIndex(items),
    totalTasks: countTasks(items),
  };
}

/**
 * Parse a partial/streaming `<plan>` block — returns items found so far
 * even if the closing tag hasn't arrived.
 */
export function parsePartialTaskPlanBlock(text: string): TaskPlan | null {
  const openTag = "<plan>";
  const startIdx = text.indexOf(openTag);
  if (startIdx === -1) return null;

  const contentStart = startIdx + openTag.length;
  const endIdx = text.indexOf("</plan>", contentStart);
  const planContent = endIdx === -1
    ? text.slice(contentStart)
    : text.slice(contentStart, endIdx);

  const lines = planContent.split("\n");

  resetIdCounter();
  const items = parseCheckboxLines(lines);
  if (items.length === 0) return null;

  activateFirstPending(items);

  return {
    items,
    currentTaskIndex: findCurrentIndex(items),
    totalTasks: countTasks(items),
  };
}

/**
 * Fallback: parse markdown checkbox list from text (not wrapped in <plan>).
 * Only returns a plan if there are 2+ checkbox items.
 */
export function parseMarkdownCheckboxList(text: string): TaskPlan | null {
  // Don't parse if there's a <plan> block — let that take priority
  if (text.includes("<plan>")) return null;

  const lines = text.split("\n");
  resetIdCounter();
  const items = parseCheckboxLines(lines);
  if (items.length < 2) return null;

  activateFirstPending(items);

  return {
    items,
    currentTaskIndex: findCurrentIndex(items),
    totalTasks: countTasks(items),
  };
}

/**
 * Extract `<task_update index="N" status="done"/>` events from text.
 */
export function extractTaskUpdates(text: string): TaskUpdateEvent[] {
  const events: TaskUpdateEvent[] = [];
  const regex = /<task_update\s+index="(\d+)"\s+status="(done|active|pending)"\s*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    events.push({
      index: parseInt(match[1], 10),
      status: match[2] as TaskUpdateEvent["status"],
    });
  }

  return events;
}

/**
 * Apply a task update to an existing plan.
 * Returns a new TaskPlan with the updated item.
 */
export function applyTaskUpdate(plan: TaskPlan, index: number, status: TaskUpdateEvent["status"]): TaskPlan {
  const newItems = plan.items.map((item, i) => {
    if (i === index) {
      return { ...item, status };
    }
    return { ...item };
  });

  // After marking an item done, activate the next pending item
  if (status === "done") {
    let foundActive = false;
    for (const item of newItems) {
      if (item.status === "active") {
        foundActive = true;
        break;
      }
    }
    if (!foundActive) {
      activateFirstPendingInList(newItems);
    }
  }

  return {
    items: newItems,
    currentTaskIndex: findCurrentIndex(newItems),
    totalTasks: plan.totalTasks,
  };
}

function activateFirstPendingInList(items: TaskPlanItem[]): void {
  for (const item of items) {
    if (item.status === "pending") {
      item.status = "active";
      return;
    }
  }
}

/**
 * Apply multiple task updates in order.
 */
export function applyTaskUpdates(plan: TaskPlan, updates: TaskUpdateEvent[]): TaskPlan {
  let current = plan;
  for (const update of updates) {
    current = applyTaskUpdate(current, update.index, update.status);
  }
  return current;
}

/**
 * Strip plan-related XML tags from the display text so they don't
 * render as raw markup in the chat bubble.
 */
export function stripPlanTags(text: string): string {
  // Remove <plan>...</plan> blocks
  let result = text.replace(/<plan>[\s\S]*?<\/plan>/g, "");
  // Remove <task_update .../> tags
  result = result.replace(/<task_update\s+[^>]*\/>/g, "");
  return result;
}
