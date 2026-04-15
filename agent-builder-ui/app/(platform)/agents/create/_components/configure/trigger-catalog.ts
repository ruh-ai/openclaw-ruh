import { MOCK_TRIGGER_CATEGORIES } from "./mockData";
import type {
  TriggerCard,
  TriggerCategory,
  TriggerSelection,
} from "./types";

type TriggerStatus = TriggerSelection["status"];
type TriggerKind = TriggerSelection["kind"];

export interface TriggerCatalogEntry extends TriggerCard {
  kind: TriggerKind;
  status: TriggerStatus;
  selectable: boolean;
  availabilityLabel: string;
}

export interface TriggerCatalogCategory
  extends Omit<TriggerCategory, "triggers"> {
  triggers: TriggerCatalogEntry[];
}

const DEFAULT_SCHEDULE = "0 9 * * 1-5";
const SCHEDULE_KEYWORDS = [
  "cron",
  "schedule",
  "daily",
  "weekly",
  "weekday",
  "weekdays",
  "hourly",
  "every weekday",
];

const TRIGGER_RUNTIME_STATUS: Record<
  string,
  { kind: TriggerKind; status: TriggerStatus; availabilityLabel: string }
> = {
  "cron-schedule": {
    kind: "schedule",
    status: "supported",
    availabilityLabel: "Deployable today",
  },
  "webhook-post": {
    kind: "webhook",
    status: "supported",
    availabilityLabel: "Signed webhook ready",
  },
};

function resolveTriggerKind(trigger: TriggerCard): TriggerKind {
  const known = TRIGGER_RUNTIME_STATUS[trigger.id];
  if (known) {
    return known.kind;
  }
  if (trigger.id.startsWith("webhook")) {
    return "webhook";
  }
  return "manual";
}

function resolveRuntimeStatus(trigger: TriggerCard): Omit<
  TriggerCatalogEntry,
  keyof TriggerCard
> {
  const known = TRIGGER_RUNTIME_STATUS[trigger.id];
  if (known) {
    return {
      kind: known.kind,
      status: known.status,
      selectable: known.status === "supported",
      availabilityLabel: known.availabilityLabel,
    };
  }

  return {
    kind: resolveTriggerKind(trigger),
    status: "unsupported",
    selectable: false,
    availabilityLabel: "Not runtime-backed yet",
  };
}

export function createTriggerCatalog(): TriggerCatalogCategory[] {
  return MOCK_TRIGGER_CATEGORIES.map((category) => ({
    ...category,
    triggers: category.triggers.map((trigger) => ({
      ...trigger,
      ...resolveRuntimeStatus(trigger),
    })),
  }));
}

export function findTriggerCatalogEntry(
  triggerId: string,
): TriggerCatalogEntry | null {
  for (const category of createTriggerCatalog()) {
    const match = category.triggers.find((trigger) => trigger.id === triggerId);
    if (match) {
      return match;
    }
  }
  return null;
}

export function detectSuggestedTriggerIds(agentRules?: string[]): string[] {
  if (!agentRules || agentRules.length === 0) {
    return [];
  }

  const combined = agentRules.join(" ").toLowerCase();
  return SCHEDULE_KEYWORDS.some((keyword) => combined.includes(keyword))
    ? ["cron-schedule"]
    : [];
}

function buildSelectionFromCatalog(
  entry: TriggerCatalogEntry,
  existing?: TriggerSelection,
): TriggerSelection {
  const selection: TriggerSelection = {
    id: entry.id,
    title: existing?.title?.trim() || entry.title,
    kind: entry.kind,
    status: entry.status,
    description: existing?.description?.trim() || entry.description,
  };

  if (entry.kind === "schedule") {
    selection.schedule = existing?.schedule?.trim() || DEFAULT_SCHEDULE;
  }

  return selection;
}

function markUnknownAsUnsupported(existing: TriggerSelection): TriggerSelection {
  return {
    ...existing,
    status: "unsupported",
  };
}

export function buildTriggerSelections(
  selectedIds: Set<string>,
  existingSelections: TriggerSelection[] = [],
): TriggerSelection[] {
  const existingById = new Map(
    existingSelections.map((selection) => [selection.id, selection]),
  );
  const selections: TriggerSelection[] = [];
  const seen = new Set<string>();

  for (const category of createTriggerCatalog()) {
    for (const trigger of category.triggers) {
      if (!selectedIds.has(trigger.id)) {
        continue;
      }
      selections.push(
        buildSelectionFromCatalog(trigger, existingById.get(trigger.id)),
      );
      seen.add(trigger.id);
    }
  }

  for (const triggerId of selectedIds) {
    if (seen.has(triggerId)) {
      continue;
    }
    const existing = existingById.get(triggerId);
    if (existing) {
      selections.push(markUnknownAsUnsupported(existing));
    }
  }

  return selections;
}

export function summarizeTriggerSelections(
  selections: TriggerSelection[],
): { supported: number; unsupported: number } {
  return selections.reduce(
    (summary, selection) => {
      if (selection.status === "supported") {
        summary.supported += 1;
      } else {
        summary.unsupported += 1;
      }
      return summary;
    },
    { supported: 0, unsupported: 0 },
  );
}
