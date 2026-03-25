import { httpError } from './utils';

export const JSON_BODY_LIMIT = '256kb';

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

export function readOptionalUnknown(input: ObjectShape, field: string): unknown {
  if (!(field in input)) {
    return undefined;
  }
  return input[field];
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
  };
}

export function validateAgentConfigPatchBody(body: unknown) {
  const input = expectStrictObject(body, {
    fieldName: 'body',
    allowedKeys: [
      'skillGraph',
      'workflow',
      'agentRules',
    ],
  });

  const skillGraph = readOptionalUnknown(input, 'skillGraph');
  const workflow = readOptionalUnknown(input, 'workflow');
  const agentRules = readOptionalStringArray(input, 'agentRules', { maxItems: 100, itemMaxLength: 4000 });

  if (skillGraph === undefined && workflow === undefined && agentRules === undefined) {
    throw httpError(400, 'At least one config field is required');
  }

  return {
    skillGraph,
    workflow,
    agentRules,
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
    ],
  });

  const name = input.name === undefined
    ? undefined
    : readRequiredString(input, 'name', { maxLength: 120 });
  const avatar = readOptionalString(input, 'avatar', { maxLength: 256 });
  const description = readOptionalString(input, 'description', { maxLength: 4000 });
  const skills = readOptionalStringArray(input, 'skills', { maxItems: 100, itemMaxLength: 120 });
  const triggerLabel = readOptionalString(input, 'triggerLabel', { maxLength: 120 });
  const status = readOptionalEnum(input, 'status', ['active', 'draft'] as const);

  if (
    name === undefined &&
    avatar === undefined &&
    description === undefined &&
    skills === undefined &&
    triggerLabel === undefined &&
    status === undefined
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
