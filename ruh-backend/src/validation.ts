import { httpError } from './utils';
import { normalizeWorkspaceRelativePath } from './workspaceFiles';

export const JSON_BODY_LIMIT = '256kb';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw httpError(400, `${fieldName} must be a valid UUID`);
  }
  return value;
}

const MAX_CONVERSATION_MESSAGE_BATCH = 100;
const MAX_CONVERSATION_MESSAGE_CONTENT = 50000;
const MAX_WORKSPACE_STATE_BYTES = 32768;

type ObjectShape = Record<string, unknown>;

function isPlainObject(value: unknown): value is ObjectShape {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function expectStrictObject(
  value: unknown,
  options: {
    fieldName?: string;
    allowedKeys: readonly string[];
  },
): ObjectShape {
  const fieldName = options.fieldName ?? 'body';
  if (!isPlainObject(value)) {
    throw httpError(400, `${fieldName} must be an object`);
  }

  const allowed = new Set(options.allowedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw httpError(422, `Unknown field: ${unknownKeys[0]}`);
  }

  return value;
}

export function readRequiredString(
  input: ObjectShape,
  field: string,
  options: { maxLength?: number; trim?: boolean } = {},
): string {
  const value = input[field];
  if (typeof value !== 'string') {
    throw httpError(400, `${field} is required`);
  }

  const normalized = options.trim === false ? value : value.trim();
  if (!normalized) {
    throw httpError(400, `${field} is required`);
  }

  if (options.maxLength !== undefined && normalized.length > options.maxLength) {
    throw httpError(422, `${field} must be at most ${options.maxLength} characters`);
  }

  return normalized;
}

export function readOptionalString(
  input: ObjectShape,
  field: string,
  options: { maxLength?: number; trim?: boolean } = {},
): string | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw httpError(422, `${field} must be a string`);
  }

  const normalized = options.trim === false ? value : value.trim();
  if (options.maxLength !== undefined && normalized.length > options.maxLength) {
    throw httpError(422, `${field} must be at most ${options.maxLength} characters`);
  }

  return normalized;
}

export function readOptionalEnum<T extends string>(
  input: ObjectShape,
  field: string,
  allowedValues: readonly T[],
): T | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw httpError(422, `${field} must be one of: ${allowedValues.join(', ')}`);
  }
  if (!allowedValues.includes(value as T)) {
    throw httpError(422, `${field} must be one of: ${allowedValues.join(', ')}`);
  }
  return value as T;
}

export function readOptionalStringArray(
  input: ObjectShape,
  field: string,
  options: { maxItems?: number; itemMaxLength?: number } = {},
): string[] | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    throw httpError(422, `${field} must contain at most ${options.maxItems} items`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw httpError(422, `${field}[${index}] must be a string`);
    }
    const normalized = item.trim();
    if (options.itemMaxLength !== undefined && normalized.length > options.itemMaxLength) {
      throw httpError(422, `${field}[${index}] must be at most ${options.itemMaxLength} characters`);
    }
    return normalized;
  });
}

function readOptionalWorkspacePathArray(
  input: ObjectShape,
  field: string,
  options: { maxItems?: number; itemMaxLength?: number } = {},
): string[] | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    throw httpError(422, `${field} must contain at most ${options.maxItems} items`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw httpError(422, `${field}[${index}] must be a string`);
    }
    const trimmed = item.trim();
    if (options.itemMaxLength !== undefined && trimmed.length > options.itemMaxLength) {
      throw httpError(422, `${field}[${index}] must be at most ${options.itemMaxLength} characters`);
    }

    try {
      return normalizeWorkspaceRelativePath(trimmed);
    } catch {
      throw httpError(422, `${field}[${index}] must be a safe relative workspace path`);
    }
  });
}

export function readOptionalUnknown(input: ObjectShape, field: string): unknown {
  if (!(field in input)) {
    return undefined;
  }
  return input[field];
}

function readOptionalToolConnections(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: ['toolId', 'name', 'description', 'status', 'authKind', 'connectorType', 'configSummary'],
    });

    const configSummary = readOptionalStringArray(entry, 'configSummary', {
      maxItems: 6,
      itemMaxLength: 240,
    }) ?? [];

    return {
      toolId: readRequiredString(entry, 'toolId', { maxLength: 120 }),
      name: readRequiredString(entry, 'name', { maxLength: 120 }),
      description: readRequiredString(entry, 'description', { maxLength: 400 }),
      status: readOptionalEnum(entry, 'status', ['available', 'configured', 'missing_secret', 'unsupported'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].status is required`); })(),
      authKind: readOptionalEnum(entry, 'authKind', ['oauth', 'api_key', 'service_account', 'none'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].authKind is required`); })(),
      connectorType: readOptionalEnum(entry, 'connectorType', ['mcp', 'api', 'cli'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].connectorType is required`); })(),
      configSummary,
    };
  });
}

function readOptionalRuntimeInputs(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: [
        'key', 'label', 'description', 'required', 'source', 'value',
        // Enriched metadata for type-aware setup page UX
        'inputType', 'defaultValue', 'example', 'options', 'group',
      ],
    });

    const required = entry.required;
    if (required !== undefined && typeof required !== 'boolean') {
      throw httpError(422, `${field}[${index}].required must be a boolean`);
    }

    return {
      key: readRequiredString(entry, 'key', { maxLength: 120 }),
      label: readRequiredString(entry, 'label', { maxLength: 120 }),
      description: readRequiredString(entry, 'description', { maxLength: 400 }),
      required: required !== false,
      source: readOptionalEnum(entry, 'source', ['architect_requirement', 'skill_requirement'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].source is required`); })(),
      value: readOptionalString(entry, 'value', { maxLength: 4000 }) ?? '',
      // Enriched metadata — all optional, backward-compatible
      ...(typeof entry.inputType === 'string' ? { inputType: entry.inputType } : {}),
      ...(typeof entry.defaultValue === 'string' ? { defaultValue: entry.defaultValue } : {}),
      ...(typeof entry.example === 'string' ? { example: entry.example } : {}),
      ...(Array.isArray(entry.options) ? { options: entry.options.filter((o: unknown): o is string => typeof o === 'string') } : {}),
      ...(typeof entry.group === 'string' ? { group: entry.group } : {}),
    };
  });
}

function readOptionalRuntimeInputValues(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: ['key', 'value'],
    });

    return {
      key: readRequiredString(entry, 'key', { maxLength: 120 }),
      value: readOptionalString(entry, 'value', { maxLength: 4000 }) ?? '',
    };
  });
}

function readOptionalTriggers(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: ['id', 'title', 'kind', 'status', 'description', 'schedule'],
    });

    return {
      id: readRequiredString(entry, 'id', { maxLength: 120 }),
      title: readRequiredString(entry, 'title', { maxLength: 120 }),
      kind: readOptionalEnum(entry, 'kind', ['manual', 'schedule', 'webhook'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].kind is required`); })(),
      status: readOptionalEnum(entry, 'status', ['supported', 'unsupported'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].status is required`); })(),
      description: readRequiredString(entry, 'description', { maxLength: 400 }),
      schedule: readOptionalString(entry, 'schedule', { maxLength: 120 }),
    };
  });
}

function readOptionalChannels(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: ['kind', 'status', 'label', 'description'],
    });

    return {
      kind: readOptionalEnum(entry, 'kind', ['telegram', 'slack', 'discord'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].kind is required`); })(),
      status: readOptionalEnum(entry, 'status', ['planned', 'configured', 'unsupported'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].status is required`); })(),
      label: readRequiredString(entry, 'label', { maxLength: 120 }),
      description: readRequiredString(entry, 'description', { maxLength: 400 }),
    };
  });
}

function readOptionalImprovements(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw httpError(422, `${field} must be an array`);
  }

  return value.map((item, index) => {
    const entry = expectStrictObject(item, {
      fieldName: `${field}[${index}]`,
      allowedKeys: ['id', 'kind', 'status', 'scope', 'title', 'summary', 'rationale', 'targetId'],
    });

    return {
      id: readRequiredString(entry, 'id', { maxLength: 120 }),
      kind: readOptionalEnum(entry, 'kind', ['tool_connection', 'trigger', 'workflow'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].kind is required`); })(),
      status: readOptionalEnum(entry, 'status', ['pending', 'accepted', 'dismissed'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].status is required`); })(),
      scope: readOptionalEnum(entry, 'scope', ['builder'] as const)
        ?? (() => { throw httpError(400, `${field}[${index}].scope is required`); })(),
      title: readRequiredString(entry, 'title', { maxLength: 160 }),
      summary: readRequiredString(entry, 'summary', { maxLength: 240 }),
      rationale: readRequiredString(entry, 'rationale', { maxLength: 400 }),
      targetId: readOptionalString(entry, 'targetId', { maxLength: 120 }),
    };
  });
}

function readOptionalDiscoveryDocuments(input: ObjectShape, field: string) {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }

  const documents = expectStrictObject(value, {
    fieldName: field,
    allowedKeys: ['prd', 'trd'],
  });

  const readDocument = (docField: 'prd' | 'trd') => {
    const rawDocument = expectStrictObject(documents[docField], {
      fieldName: `${field}.${docField}`,
      allowedKeys: ['title', 'sections'],
    });
    const sections = rawDocument.sections;
    if (!Array.isArray(sections)) {
      throw httpError(422, `${field}.${docField}.sections must be an array`);
    }

    return {
      title: readRequiredString(rawDocument, 'title', { maxLength: 160 }),
      sections: sections.map((section, index) => {
        const entry = expectStrictObject(section, {
          fieldName: `${field}.${docField}.sections[${index}]`,
          allowedKeys: ['heading', 'content'],
        });
        return {
          heading: readRequiredString(entry, 'heading', { maxLength: 160 }),
          content: readRequiredString(entry, 'content', { maxLength: 8000, trim: false }),
        };
      }),
    };
  };

  return {
    prd: readDocument('prd'),
    trd: readDocument('trd'),
  };
}

function readRequiredNumber(
  input: ObjectShape,
  field: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): number {
  const value = input[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw httpError(400, `${field} is required`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw httpError(422, `${field} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw httpError(422, `${field} must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw httpError(422, `${field} must be at most ${options.max}`);
  }
  return value;
}

function readOptionalNumber(
  input: ObjectShape,
  field: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): number | undefined {
  if (!(field in input)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw httpError(422, `${field} must be a number`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw httpError(422, `${field} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw httpError(422, `${field} must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw httpError(422, `${field} must be at most ${options.max}`);
  }
  return value;
}

export interface PersistedBrowserWorkspaceItem {
  id: number;
  kind: 'navigation' | 'action' | 'screenshot' | 'preview';
  label: string;
  detail?: string;
  url?: string;
  timestamp: number;
}

export interface PersistedBrowserTakeoverState {
  status: 'requested' | 'resumed';
  reason: string;
  actionLabel: string;
  updatedAt: number;
}

export interface PersistedBrowserWorkspaceState {
  items?: PersistedBrowserWorkspaceItem[];
  previewUrl?: string;
  takeover?: PersistedBrowserTakeoverState | null;
}

export interface PersistedTaskPlanItem {
  id: number;
  label: string;
  status: 'pending' | 'active' | 'done';
  children?: PersistedTaskPlanItem[];
}

export interface PersistedTaskPlan {
  items: PersistedTaskPlanItem[];
  currentTaskIndex: number;
  totalTasks: number;
}

export interface PersistedTaskStep {
  id: number;
  kind: 'thinking' | 'tool' | 'writing';
  label: string;
  detail?: string;
  toolName?: string;
  status: 'active' | 'done';
  startedAt: number;
  elapsedMs?: number;
}

export interface PersistedTaskWorkspaceState {
  plan?: PersistedTaskPlan;
  steps?: PersistedTaskStep[];
}

export interface PersistedWorkspaceState {
  version: 1;
  browser?: PersistedBrowserWorkspaceState;
  task?: PersistedTaskWorkspaceState;
}

function validatePersistedBrowserWorkspaceItem(value: unknown, fieldName: string): PersistedBrowserWorkspaceItem {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['id', 'kind', 'label', 'detail', 'url', 'timestamp'],
  });

  return {
    id: readRequiredNumber(input, 'id', { integer: true, min: 0 }),
    kind: readOptionalEnum(input, 'kind', ['navigation', 'action', 'screenshot', 'preview'] as const)
      ?? (() => { throw httpError(400, `${fieldName}.kind is required`); })(),
    label: readRequiredString(input, 'label', { maxLength: 400 }),
    detail: readOptionalString(input, 'detail', { maxLength: 2000 }),
    url: readOptionalString(input, 'url', { maxLength: 4000 }),
    timestamp: readRequiredNumber(input, 'timestamp', { integer: true, min: 0 }),
  };
}

function validatePersistedBrowserTakeoverState(
  value: unknown,
  fieldName: string,
): PersistedBrowserTakeoverState {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['status', 'reason', 'actionLabel', 'updatedAt'],
  });

  const status = readOptionalEnum(input, 'status', ['requested', 'resumed'] as const);
  if (!status) {
    throw httpError(400, `${fieldName}.status is required`);
  }

  return {
    status,
    reason: readRequiredString(input, 'reason', { maxLength: 2000 }),
    actionLabel: readRequiredString(input, 'actionLabel', { maxLength: 200 }),
    updatedAt: readRequiredNumber(input, 'updatedAt', { integer: true, min: 0 }),
  };
}

function validatePersistedBrowserWorkspaceState(
  value: unknown,
  fieldName: string,
): PersistedBrowserWorkspaceState {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['items', 'previewUrl', 'takeover'],
  });

  const rawItems = input.items;
  const items = rawItems === undefined
    ? undefined
    : Array.isArray(rawItems)
      ? rawItems.map((item, index) =>
        validatePersistedBrowserWorkspaceItem(item, `${fieldName}.items[${index}]`),
      )
      : (() => { throw httpError(422, `${fieldName}.items must be an array`); })();

  if (items && items.length > 100) {
    throw httpError(422, `${fieldName}.items must contain at most 100 items`);
  }

  const previewUrl = readOptionalString(input, 'previewUrl', { maxLength: 4000 });
  const rawTakeover = readOptionalUnknown(input, 'takeover');
  const takeover = rawTakeover === undefined
    ? undefined
    : rawTakeover === null
      ? null
      : validatePersistedBrowserTakeoverState(rawTakeover, `${fieldName}.takeover`);

  if ((!items || items.length === 0) && !previewUrl && takeover == null) {
    throw httpError(422, `${fieldName} must include items, previewUrl, or takeover`);
  }

  return {
    items,
    previewUrl,
    takeover,
  };
}

function validatePersistedTaskPlanItem(
  value: unknown,
  fieldName: string,
): PersistedTaskPlanItem {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['id', 'label', 'status', 'children'],
  });

  const rawChildren = input.children;
  const children = rawChildren === undefined
    ? undefined
    : Array.isArray(rawChildren)
      ? rawChildren.map((child, index) =>
        validatePersistedTaskPlanItem(child, `${fieldName}.children[${index}]`),
      )
      : (() => { throw httpError(422, `${fieldName}.children must be an array`); })();

  if (children && children.length > 20) {
    throw httpError(422, `${fieldName}.children must contain at most 20 items`);
  }

  return {
    id: readRequiredNumber(input, 'id', { integer: true, min: 0 }),
    label: readRequiredString(input, 'label', { maxLength: 400 }),
    status: readOptionalEnum(input, 'status', ['pending', 'active', 'done'] as const)
      ?? (() => { throw httpError(400, `${fieldName}.status is required`); })(),
    children,
  };
}

function countPersistedTaskPlanItems(items: PersistedTaskPlanItem[]): number {
  return items.reduce((count, item) => count + 1 + countPersistedTaskPlanItems(item.children ?? []), 0);
}

function validatePersistedTaskPlan(
  value: unknown,
  fieldName: string,
): PersistedTaskPlan {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['items', 'currentTaskIndex', 'totalTasks'],
  });

  const rawItems = input.items;
  if (!Array.isArray(rawItems)) {
    throw httpError(422, `${fieldName}.items must be an array`);
  }

  const items = rawItems.map((item, index) =>
    validatePersistedTaskPlanItem(item, `${fieldName}.items[${index}]`),
  );

  if (items.length === 0) {
    throw httpError(422, `${fieldName}.items must contain at least 1 item`);
  }

  const totalCount = countPersistedTaskPlanItems(items);
  if (totalCount > 100) {
    throw httpError(422, `${fieldName}.items must contain at most 100 total items`);
  }

  return {
    items,
    currentTaskIndex: readRequiredNumber(input, 'currentTaskIndex', { integer: true, min: -1, max: totalCount - 1 }),
    totalTasks: readRequiredNumber(input, 'totalTasks', { integer: true, min: 1, max: 100 }),
  };
}

function validatePersistedTaskStep(
  value: unknown,
  fieldName: string,
): PersistedTaskStep {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['id', 'kind', 'label', 'detail', 'toolName', 'status', 'startedAt', 'elapsedMs'],
  });

  return {
    id: readRequiredNumber(input, 'id', { integer: true, min: 0 }),
    kind: readOptionalEnum(input, 'kind', ['thinking', 'tool', 'writing'] as const)
      ?? (() => { throw httpError(400, `${fieldName}.kind is required`); })(),
    label: readRequiredString(input, 'label', { maxLength: 240 }),
    detail: readOptionalString(input, 'detail', { maxLength: 4000, trim: false }),
    toolName: readOptionalString(input, 'toolName', { maxLength: 120 }),
    status: readOptionalEnum(input, 'status', ['active', 'done'] as const)
      ?? (() => { throw httpError(400, `${fieldName}.status is required`); })(),
    startedAt: readRequiredNumber(input, 'startedAt', { integer: true, min: 0 }),
    elapsedMs: readOptionalNumber(input, 'elapsedMs', { integer: true, min: 0 }),
  };
}

function validatePersistedTaskWorkspaceState(
  value: unknown,
  fieldName: string,
): PersistedTaskWorkspaceState {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['plan', 'steps'],
  });

  const plan = input.plan === undefined
    ? undefined
    : validatePersistedTaskPlan(input.plan, `${fieldName}.plan`);

  const rawSteps = input.steps;
  const steps = rawSteps === undefined
    ? undefined
    : Array.isArray(rawSteps)
      ? rawSteps.map((step, index) =>
        validatePersistedTaskStep(step, `${fieldName}.steps[${index}]`),
      )
      : (() => { throw httpError(422, `${fieldName}.steps must be an array`); })();

  if (steps && steps.length > 100) {
    throw httpError(422, `${fieldName}.steps must contain at most 100 items`);
  }

  if (!plan && (!steps || steps.length === 0)) {
    throw httpError(422, `${fieldName} must include plan or steps`);
  }

  return {
    plan,
    steps,
  };
}

function validatePersistedWorkspaceState(value: unknown, fieldName: string): PersistedWorkspaceState {
  const input = expectStrictObject(value, {
    fieldName,
    allowedKeys: ['version', 'browser', 'task'],
  });

  const version = readRequiredNumber(input, 'version', { integer: true, min: 1, max: 1 });
  if (version !== 1) {
    throw httpError(422, `${fieldName}.version must be 1`);
  }

  const browser = input.browser === undefined
    ? undefined
    : validatePersistedBrowserWorkspaceState(input.browser, `${fieldName}.browser`);
  const task = input.task === undefined
    ? undefined
    : validatePersistedTaskWorkspaceState(input.task, `${fieldName}.task`);

  if (!browser && !task) {
    throw httpError(422, `${fieldName} must include at least one supported workspace surface`);
  }

  const normalized: PersistedWorkspaceState = {
    version: 1,
    browser,
    task,
  };

  const encoded = JSON.stringify(normalized);
  if (encoded.length > MAX_WORKSPACE_STATE_BYTES) {
    throw httpError(422, `${fieldName} must be at most ${MAX_WORKSPACE_STATE_BYTES} bytes when serialized`);
  }

  return normalized;
}

export function validateAgentCreateBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: [
      'name',
      'avatar',
      'description',
      'skills',
      'triggerLabel',
      'status',
      'skillGraph',
      'workflow',
      'agentRules',
      'runtimeInputs',
      'toolConnections',
      'triggers',
      'improvements',
      'channels',
      'discoveryDocuments',
      'forge_sandbox_id',
    ],
  });

  return {
    name: readRequiredString(input, 'name', { maxLength: 120 }),
    avatar: readOptionalString(input, 'avatar', { maxLength: 256 }),
    description: readOptionalString(input, 'description', { maxLength: 4000 }),
    skills: readOptionalStringArray(input, 'skills', { maxItems: 100, itemMaxLength: 120 }),
    triggerLabel: readOptionalString(input, 'triggerLabel', { maxLength: 120 }),
    status: readOptionalEnum(input, 'status', ['active', 'draft'] as const),
    skillGraph: readOptionalUnknown(input, 'skillGraph'),
    workflow: readOptionalUnknown(input, 'workflow'),
    agentRules: readOptionalStringArray(input, 'agentRules', { maxItems: 100, itemMaxLength: 4000 }),
    runtimeInputs: readOptionalRuntimeInputs(input, 'runtimeInputs'),
    toolConnections: readOptionalToolConnections(input, 'toolConnections'),
    triggers: readOptionalTriggers(input, 'triggers'),
    improvements: readOptionalImprovements(input, 'improvements'),
    channels: readOptionalChannels(input, 'channels'),
    discoveryDocuments: readOptionalDiscoveryDocuments(input, 'discoveryDocuments'),
    forge_sandbox_id: readOptionalString(input, 'forge_sandbox_id', { maxLength: 200 }),
  };
}

export function validateAgentConfigPatchBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: [
      'skillGraph',
      'workflow',
      'agentRules',
      'runtimeInputs',
      'toolConnections',
      'triggers',
      'improvements',
      'channels',
      'discoveryDocuments',
      'creationSession',
    ],
  });

  const skillGraph = readOptionalUnknown(input, 'skillGraph');
  const workflow = readOptionalUnknown(input, 'workflow');
  const agentRules = readOptionalStringArray(input, 'agentRules', { maxItems: 100, itemMaxLength: 4000 });
  const runtimeInputs = readOptionalRuntimeInputs(input, 'runtimeInputs');
  const toolConnections = readOptionalToolConnections(input, 'toolConnections');
  const triggers = readOptionalTriggers(input, 'triggers');
  const improvements = readOptionalImprovements(input, 'improvements');
  const channels = readOptionalChannels(input, 'channels');
  const discoveryDocuments = readOptionalDiscoveryDocuments(input, 'discoveryDocuments');
  const creationSession = readOptionalUnknown(input, 'creationSession');
  if (creationSession !== undefined && creationSession !== null) {
    const serialized = JSON.stringify(creationSession);
    if (serialized.length > 512_000) {
      throw httpError(400, 'creationSession exceeds 512 KB size limit');
    }
  }

  if (skillGraph === undefined && workflow === undefined && agentRules === undefined && runtimeInputs === undefined && toolConnections === undefined && triggers === undefined && improvements === undefined && channels === undefined && discoveryDocuments === undefined && creationSession === undefined) {
    throw httpError(400, 'At least one config field is required');
  }

  return {
    skillGraph,
    workflow,
    agentRules,
    runtimeInputs,
    toolConnections,
    triggers,
    improvements,
    channels,
    discoveryDocuments,
    creationSession,
  };
}

export function validateAgentMetadataPatchBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: [
      'name',
      'avatar',
      'description',
      'skills',
      'triggerLabel',
      'status',
      'channels',
      'forge_sandbox_id',
    ],
  });

  const name = input.name === undefined
    ? undefined
    : readRequiredString(input, 'name', { maxLength: 120 });
  const avatar = readOptionalString(input, 'avatar', { maxLength: 256 });
  const description = readOptionalString(input, 'description', { maxLength: 4000 });
  const skills = readOptionalStringArray(input, 'skills', { maxItems: 100, itemMaxLength: 120 });
  const triggerLabel = readOptionalString(input, 'triggerLabel', { maxLength: 120 });
  const status = readOptionalEnum(input, 'status', ['active', 'draft', 'forging'] as const);
  const channels = readOptionalChannels(input, 'channels');
  const forge_sandbox_id = readOptionalString(input, 'forge_sandbox_id', { maxLength: 200 });

  if (
    name === undefined &&
    avatar === undefined &&
    description === undefined &&
    skills === undefined &&
    triggerLabel === undefined &&
    status === undefined &&
    channels === undefined &&
    forge_sandbox_id === undefined
  ) {
    throw httpError(400, 'At least one metadata field is required');
  }

  return {
    name,
    avatar,
    description,
    skills,
    triggerLabel,
    status,
    channels,
    forge_sandbox_id,
  };
}

export function validateCustomerAgentConfigPatchBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: ['name', 'description', 'agentRules', 'runtimeInputValues'],
  });

  const name = input.name === undefined
    ? undefined
    : readRequiredString(input, 'name', { maxLength: 120 });
  const description = readOptionalString(input, 'description', { maxLength: 4000 });
  const agentRules = readOptionalStringArray(input, 'agentRules', {
    maxItems: 100,
    itemMaxLength: 4000,
  });
  const runtimeInputValues = readOptionalRuntimeInputValues(
    input,
    'runtimeInputValues',
  );

  if (
    name === undefined &&
    description === undefined &&
    agentRules === undefined &&
    runtimeInputValues === undefined
  ) {
    throw httpError(400, 'At least one config field is required');
  }

  return {
    name,
    description,
    agentRules,
    runtimeInputValues,
  };
}

export function validateAgentSandboxAttachBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: ['sandbox_id'],
  });

  return {
    sandbox_id: readRequiredString(input, 'sandbox_id', { maxLength: 200 }),
  };
}

export function validateAgentWorkspaceMemoryPatchBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: ['instructions', 'continuitySummary', 'pinnedPaths'],
  });

  const instructions = readOptionalString(input, 'instructions', { maxLength: 6000 });
  const continuitySummary = readOptionalString(input, 'continuitySummary', { maxLength: 2000 });
  const pinnedPaths = readOptionalWorkspacePathArray(input, 'pinnedPaths', {
    maxItems: 8,
    itemMaxLength: 240,
  });

  if (instructions === undefined && continuitySummary === undefined && pinnedPaths === undefined) {
    throw httpError(400, 'At least one workspace memory field is required');
  }

  return {
    instructions,
    continuitySummary,
    pinnedPaths,
  };
}

export function validateConversationMessagesAppendBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: ['messages'],
  });

  const rawMessages = input.messages;
  if (rawMessages === undefined) {
    throw httpError(400, 'messages is required');
  }
  if (!Array.isArray(rawMessages)) {
    throw httpError(422, 'messages must be an array');
  }
  if (rawMessages.length > MAX_CONVERSATION_MESSAGE_BATCH) {
    throw httpError(422, `messages must contain at most ${MAX_CONVERSATION_MESSAGE_BATCH} items`);
  }

  return {
    messages: rawMessages.map((message, index) => {
      const fieldName = `messages[${index}]`;
      const messageInput = expectStrictObject(message, {
        fieldName,
        allowedKeys: ['role', 'content', 'workspace_state'],
      });

      const role = readOptionalEnum(messageInput, 'role', ['user', 'assistant', 'system'] as const);
      if (!role) {
        throw httpError(400, `${fieldName}.role is required`);
      }

      const content = messageInput.content === undefined
        ? ''
        : readOptionalString(messageInput, 'content', {
          maxLength: MAX_CONVERSATION_MESSAGE_CONTENT,
          trim: false,
        }) ?? '';

      const workspaceState = messageInput.workspace_state === undefined
        ? undefined
        : validatePersistedWorkspaceState(messageInput.workspace_state, `${fieldName}.workspace_state`);

      return {
        role,
        content,
        workspace_state: workspaceState,
      };
    }),
  };
}
