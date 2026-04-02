interface TranscriptMessageRecord {
  role?: unknown;
  content?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  details?: unknown;
}

export interface TranscriptToolEvent {
  type: 'tool_start' | 'tool_end';
  tool: string;
  name: string;
  input?: string;
  output?: string;
  toolCallId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toToolName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function toToolCallId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function truncate(value: string, maxLength = 4000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function summarizeToolInput(argumentsValue: unknown): string | undefined {
  if (typeof argumentsValue === 'string' && argumentsValue.trim().length > 0) {
    return truncate(argumentsValue.trim());
  }
  if (!isRecord(argumentsValue)) {
    return undefined;
  }

  for (const key of [
    'command',
    'cmd',
    'url',
    'path',
    'filePath',
    'query',
    'prompt',
    'text',
    'selector',
  ]) {
    const value = argumentsValue[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return truncate(value.trim());
    }
  }

  try {
    const serialized = JSON.stringify(argumentsValue);
    return serialized === '{}' ? undefined : truncate(serialized);
  } catch {
    return undefined;
  }
}

function summarizeToolOutput(message: TranscriptMessageRecord): string | undefined {
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .map((item) => {
        if (!isRecord(item)) return '';
        return typeof item.text === 'string' ? item.text : '';
      })
      .filter((value) => value.length > 0);
    if (textParts.length > 0) {
      return truncate(textParts.join('\n'));
    }
  }

  if (isRecord(message.details)) {
    for (const key of ['aggregated', 'output', 'result']) {
      const value = message.details[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return truncate(value.trim());
      }
    }
    try {
      const serialized = JSON.stringify(message.details);
      return serialized === '{}' ? undefined : truncate(serialized);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function resolveSessionTranscriptFile(
  sessionsIndexContent: string,
  sessionKey: string,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sessionsIndexContent);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }
  const sessionRecord = parsed[sessionKey];
  if (!isRecord(sessionRecord)) {
    return null;
  }
  const sessionFile = sessionRecord.sessionFile;
  return typeof sessionFile === 'string' && sessionFile.trim().length > 0
    ? sessionFile.trim()
    : null;
}

export function extractToolEventsFromTranscript(
  transcriptContent: string,
): TranscriptToolEvent[] {
  const lines = transcriptContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries: Array<{ type?: string; message?: TranscriptMessageRecord }> = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      entries.push({
        type: typeof parsed.type === 'string' ? parsed.type : undefined,
        message: isRecord(parsed.message)
          ? (parsed.message as TranscriptMessageRecord)
          : undefined,
      });
    } catch {
      continue;
    }
  }

  let lastUserIndex = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const message = entries[index].message;
    if (
      entries[index].type === 'message' &&
      message &&
      message.role === 'user'
    ) {
      lastUserIndex = index;
    }
  }

  const toolEvents: TranscriptToolEvent[] = [];
  for (let index = lastUserIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    const message = entry.message;
    if (entry.type !== 'message' || !message) {
      continue;
    }

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const item of message.content) {
        if (!isRecord(item) || item.type !== 'toolCall') {
          continue;
        }
        const toolName = toToolName(item.name);
        if (!toolName) {
          continue;
        }
        toolEvents.push({
          type: 'tool_start',
          tool: toolName,
          name: toolName,
          input: summarizeToolInput(item.arguments),
          toolCallId: toToolCallId(item.id),
        });
      }
      continue;
    }

    if (message.role === 'toolResult') {
      const toolName = toToolName(message.toolName);
      if (!toolName) {
        continue;
      }
      toolEvents.push({
        type: 'tool_end',
        tool: toolName,
        name: toolName,
        output: summarizeToolOutput(message),
        toolCallId: toToolCallId(message.toolCallId),
      });
    }
  }

  return toolEvents;
}
