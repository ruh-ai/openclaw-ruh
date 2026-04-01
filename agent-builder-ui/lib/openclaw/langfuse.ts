import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  startActiveObservation,
  updateActiveObservation,
  propagateAttributes,
} from "@langfuse/tracing";

type BridgeObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ToolSpanHandle {
  /** End the tool span, capturing output and final metadata. */
  end: (output?: unknown, metadata?: Record<string, unknown>) => void;
}

export interface BridgeTraceHandle {
  enabled: boolean;
  traceId: string | null;

  /** Record a point-in-time event within the trace. */
  recordEvent: (
    name: string,
    metadata?: Record<string, unknown>,
    level?: BridgeObservationLevel
  ) => void;

  /** Update the root agent observation (output, metadata, statusMessage). */
  update: (attributes: {
    output?: unknown;
    metadata?: Record<string, unknown>;
    statusMessage?: string;
    level?: BridgeObservationLevel;
  }) => void;

  /**
   * Start a timed tool-call span.
   * Call `.end()` when the tool execution completes.
   * Returns a no-op handle when Langfuse is disabled.
   */
  startToolSpan: (
    toolName: string,
    metadata?: Record<string, unknown>
  ) => ToolSpanHandle;

  /**
   * Record an LLM generation observation (final agent response).
   * Use this for the final architect response so token-level usage shows up
   * in the Langfuse generations view.
   */
  recordGeneration: (
    name: string,
    attrs: {
      input?: unknown;
      output?: unknown;
      model?: string;
      usageDetails?: { input?: number; output?: number; total?: number };
      metadata?: Record<string, unknown>;
    }
  ) => void;

  /**
   * Post a numeric quality score to Langfuse for this trace.
   * Scores appear in the Scores tab and on the sessions/traces list.
   * No-op when Langfuse is disabled or traceId is unavailable.
   */
  addScore: (name: string, value: number, comment?: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level SDK state (singleton, initialized once)
// ---------------------------------------------------------------------------

let sdkInitPromise: Promise<void> | null = null;
let langfuseSpanProcessor: LangfuseSpanProcessor | null = null;

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

/**
 * Keys whose values should never be exported to Langfuse.
 * Uses substring matching so "access_token" and "api_key_secret" are caught.
 *
 * Token counts ("tokens", "prompt_tokens", "completion_tokens", etc.) are
 * NOT sensitive and are explicitly allowed via SAFE_METRIC_KEY_PATTERN.
 */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|api[_-]?key|authorization|cookie|credential|password|prompt|soul)/i;

/**
 * Keys that look like they contain "token" but are actually safe metric names.
 * These are checked FIRST; a key matching here is never redacted.
 */
const SAFE_METRIC_KEY_PATTERN =
  /^(tokens|total_tokens|prompt_tokens|completion_tokens|input_tokens|output_tokens|token_count|token_usage|token_budget|token_limit)$/i;

const MAX_STRING_LENGTH = 500;

function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    // Safe metric keys (token counts) are always allowed through
    if (SAFE_METRIC_KEY_PATTERN.test(key)) {
      const sanitizedValue = sanitizeValue(nestedValue);
      if (sanitizedValue !== undefined) result[key] = sanitizedValue;
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    const sanitizedValue = sanitizeValue(nestedValue);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// SDK initialisation
// ---------------------------------------------------------------------------

async function ensureLangfuseSdk(): Promise<boolean> {
  if (!isLangfuseConfigured()) {
    return false;
  }

  if (!sdkInitPromise) {
    langfuseSpanProcessor = new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
      environment:
        process.env.LANGFUSE_TRACING_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.LANGFUSE_RELEASE,
      exportMode: "immediate",
      mask: ({ data }) => sanitizeValue(data),
      shouldExportSpan: ({ otelSpan }) =>
        otelSpan.name.startsWith("openclaw.bridge"),
    });

    const sdk = new NodeSDK({
      spanProcessors: [langfuseSpanProcessor],
    });

    sdkInitPromise = Promise.resolve(sdk.start()).then(() => undefined);
  }

  await sdkInitPromise;
  return true;
}

async function flushLangfuseSpans(): Promise<void> {
  if (!langfuseSpanProcessor) {
    return;
  }
  try {
    await langfuseSpanProcessor.forceFlush();
  } catch (error) {
    console.warn(
      "[Langfuse] Failed to flush bridge trace spans:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

// ---------------------------------------------------------------------------
// Scores — posted via REST after the span context is available
// ---------------------------------------------------------------------------

async function postScore(
  traceId: string,
  name: string,
  value: number,
  comment?: string
): Promise<void> {
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!baseUrl || !publicKey || !secretKey) return;

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  try {
    await fetch(`${baseUrl}/api/public/scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        traceId,
        name,
        value,
        dataType: "NUMERIC",
        ...(comment ? { comment } : {}),
      }),
    });
  } catch (err) {
    console.warn(
      "[Langfuse] Failed to post score:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// Disabled (no-op) handle
// ---------------------------------------------------------------------------

function createDisabledTraceHandle(): BridgeTraceHandle {
  return {
    enabled: false,
    traceId: null,
    recordEvent: () => {},
    update: () => {},
    startToolSpan: () => ({ end: () => {} }),
    recordGeneration: () => {},
    addScore: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

export async function withLangfuseBridgeTrace<T>(
  options: {
    name: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    /** Langfuse session ID — groups all turns of one conversation together. */
    sessionId?: string;
    /** Langfuse user ID — maps to agent ID, org, or auth user. */
    userId?: string;
    /** Free-form tags for filtering (e.g. ["mode:build", "agent:architect"]). */
    tags?: string[];
  },
  fn: (trace: BridgeTraceHandle) => Promise<T>
): Promise<{ result: T; traceId: string | null }> {
  const enabled = await ensureLangfuseSdk();
  if (!enabled) {
    return {
      result: await fn(createDisabledTraceHandle()),
      traceId: null,
    };
  }

  try {
    return await propagateAttributes(
      {
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(options.userId ? { userId: options.userId } : {}),
        ...(options.tags?.length ? { tags: options.tags } : {}),
      },
      () =>
        startActiveObservation(
          options.name,
          async (observation) => {
            updateActiveObservation(
              {
                input: sanitizeValue(options.input),
                metadata: sanitizeValue(options.metadata) as Record<
                  string,
                  unknown
                >,
                level: "DEFAULT",
              },
              { asType: "agent" }
            );

            const traceId = observation.traceId;

            const traceHandle: BridgeTraceHandle = {
              enabled: true,
              traceId,

              recordEvent: (name, metadata, level = "DEFAULT") => {
                const event = observation.startObservation(
                  name,
                  {
                    metadata: sanitizeValue(metadata) as Record<
                      string,
                      unknown
                    >,
                    level,
                  },
                  { asType: "event" }
                );
                event.end();
              },

              update: (attributes) => {
                updateActiveObservation(
                  {
                    output: sanitizeValue(attributes.output),
                    metadata: sanitizeValue(attributes.metadata) as
                      | Record<string, unknown>
                      | undefined,
                    statusMessage: attributes.statusMessage,
                    level: attributes.level,
                  },
                  { asType: "agent" }
                );
              },

              startToolSpan: (toolName, metadata) => {
                const span = observation.startObservation(
                  `openclaw.bridge.tool.${toolName}`,
                  {
                    input: sanitizeValue(metadata) as Record<string, unknown>,
                    metadata: sanitizeValue(metadata) as Record<string, unknown>,
                  },
                  { asType: "tool" }
                );
                return {
                  end: (output, endMetadata) => {
                    span.update({
                      output: sanitizeValue(output),
                      metadata: sanitizeValue(endMetadata) as
                        | Record<string, unknown>
                        | undefined,
                    });
                    span.end();
                  },
                };
              },

              recordGeneration: (name, attrs) => {
                const gen = observation.startObservation(
                  name,
                  {
                    input: sanitizeValue(attrs.input),
                    output: sanitizeValue(attrs.output),
                    model: attrs.model,
                    usageDetails: attrs.usageDetails,
                    metadata: sanitizeValue(attrs.metadata) as
                      | Record<string, unknown>
                      | undefined,
                  },
                  { asType: "generation" }
                );
                gen.end();
              },

              addScore: async (name, value, comment) => {
                if (!traceId) return;
                // Fire-and-forget — scores are best-effort observability
                postScore(traceId, name, value, comment).catch(() => {});
              },
            };

            try {
              const result = await fn(traceHandle);
              return { result, traceId };
            } catch (error) {
              traceHandle.update({
                level: "ERROR",
                statusMessage:
                  error instanceof Error ? error.message : String(error),
                metadata: {
                  final_error:
                    error instanceof Error ? error.message : String(error),
                },
              });
              throw error;
            }
          },
          { asType: "agent" }
        )
    );
  } finally {
    await flushLangfuseSpans();
  }
}
