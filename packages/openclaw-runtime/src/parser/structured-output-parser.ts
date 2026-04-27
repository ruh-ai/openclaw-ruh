/**
 * Structured output parser — three-layer fallback.
 *
 * Implements: docs/spec/openclaw-v1/015-output-validator.md
 *
 * Layer 1 — JSON parse: if response is structured JSON, parse + validate
 * Layer 2 — Marker tokenizer: extract self-closing XML markers (state machine)
 * Layer 3 — Heuristic extraction: regex/keyword fallback (last resort, opt-in)
 *
 * Per spec 015:
 *   - Diagnostics, not silent drops: failed validation produces a typed entry
 *   - Layer is recorded on every successful or failed parse
 *   - Streaming parser handles deltas and deduplicates identical markers
 */

import type { ZodType } from "zod";
import {
  feedDelta,
  createTokenizerState,
  parseJsonAttribute,
} from "./marker-tokenizer";
import type { TokenizerState } from "./marker-tokenizer";

// ─── Types ─────────────────────────────────────────────────────────────

export interface ParsedMarkerEvent {
  readonly name: string;
  /** Validated attributes, with JSON-decoded values where applicable. */
  readonly value: Readonly<Record<string, unknown>>;
}

export interface OutputValidationFailedDiagnostic {
  readonly type: "output_validation_failed";
  readonly markerName: string;
  readonly schema: string;
  readonly error: string;
  readonly raw: unknown;
  readonly layer: 1 | 2 | 3;
}

export interface ParserFallbackDiagnostic {
  readonly type: "parser_fallback";
  readonly layer: 3;
  readonly rawExcerpt: string;
  readonly extracted: Record<string, unknown>;
  readonly confidence: number;
}

export type ParserDiagnostic = OutputValidationFailedDiagnostic | ParserFallbackDiagnostic;

// ─── Schema registry binding ──────────────────────────────────────────

/**
 * Binds a marker name to the Zod schema validating its attributes. The pipeline
 * supplies these via pipeline-manifest.json's output_validator.schemas[]; the
 * runtime canonical schemas (RevealSchema, PlanSkillSchema, etc.) are also
 * registered as bindings.
 */
export interface MarkerSchemaBinding {
  readonly markerName: string;
  /** Display name for diagnostics — e.g. "openclaw-v1:RevealSchema". */
  readonly schemaName: string;
  readonly schema: ZodType<unknown>;
}

export class MarkerSchemaRegistry {
  readonly #bindings = new Map<string, MarkerSchemaBinding>();

  bind(binding: MarkerSchemaBinding): void {
    if (this.#bindings.has(binding.markerName)) {
      throw new Error(`Marker "${binding.markerName}" is already bound to a schema.`);
    }
    this.#bindings.set(binding.markerName, binding);
  }

  get(markerName: string): MarkerSchemaBinding | undefined {
    return this.#bindings.get(markerName);
  }

  has(markerName: string): boolean {
    return this.#bindings.has(markerName);
  }

  list(): ReadonlyArray<MarkerSchemaBinding> {
    return Array.from(this.#bindings.values());
  }
}

// ─── Validation ────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { readonly valid: true; readonly data: T }
  | { readonly valid: false; readonly error: string; readonly raw: unknown };

/** Validate parsed data against a schema. Always returns ValidationResult — never throws. */
export function validateOutput<T>(
  schema: ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  const error = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { valid: false, error, raw: data };
}

// ─── Streaming parser ─────────────────────────────────────────────────

export interface StreamingParser {
  /** Feed a streaming delta. Returns events extracted from this + buffered text. */
  feed(delta: string): ReadonlyArray<ParsedMarkerEvent>;
  /** Drain remaining buffer at end-of-stream. */
  flush(): ReadonlyArray<ParsedMarkerEvent>;
  /** Diagnostics emitted by feed/flush (one entry per failed validation). */
  drainDiagnostics(): ReadonlyArray<ParserDiagnostic>;
}

export interface StreamingParserOptions {
  /** Schemas to validate against. Markers not bound here pass through with raw attributes. */
  readonly registry: MarkerSchemaRegistry;
  /** Allow markers without a registered schema to emit unvalidated. Default: false. */
  readonly passUnregisteredMarkers?: boolean;
}

/**
 * Create a streaming Layer-2 parser. Maintains tokenizer state across feeds,
 * deduplicates emitted markers (same name + attribute hash won't fire twice),
 * validates each marker against its schema, and accumulates diagnostics.
 */
export function createStreamingParser(options: StreamingParserOptions): StreamingParser {
  let state: TokenizerState = createTokenizerState();
  const emitted = new Set<string>();
  const diagnostics: ParserDiagnostic[] = [];

  function processBatch(deltaResult: ReturnType<typeof feedDelta>): ParsedMarkerEvent[] {
    const events: ParsedMarkerEvent[] = [];

    for (const token of deltaResult.tokens) {
      // Decode JSON-shaped attributes
      const value: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(token.attributes)) {
        const parsed = parseJsonAttribute(raw);
        value[key] = parsed !== null ? parsed : raw;
      }

      const dedupeKey = `${token.name}:${JSON.stringify(value)}`;
      if (emitted.has(dedupeKey)) continue;
      emitted.add(dedupeKey);

      const binding = options.registry.get(token.name);
      if (binding) {
        const result = validateOutput(binding.schema, value);
        if (result.valid) {
          events.push({ name: token.name, value: result.data as Record<string, unknown> });
        } else {
          diagnostics.push({
            type: "output_validation_failed",
            markerName: token.name,
            schema: binding.schemaName,
            error: result.error,
            raw: result.raw,
            layer: 2,
          });
          // Spec 015: silent drops are forbidden — the diagnostic is the drop.
        }
      } else if (options.passUnregisteredMarkers) {
        events.push({ name: token.name, value });
      } else {
        diagnostics.push({
          type: "output_validation_failed",
          markerName: token.name,
          schema: "<unregistered>",
          error: `Marker "${token.name}" has no registered schema and passUnregisteredMarkers is false.`,
          raw: value,
          layer: 2,
        });
      }
    }

    return events;
  }

  return {
    feed(delta: string) {
      const result = feedDelta(state, delta);
      state = result.state;
      return processBatch(result);
    },
    flush() {
      if (state.buffer.length === 0) return [];

      const raw = state.buffer;
      diagnostics.push({
        type: "output_validation_failed",
        markerName: markerNameFromIncomplete(raw),
        schema: "<incomplete>",
        error: "Incomplete marker at end of stream.",
        raw,
        layer: 2,
      });
      state = { buffer: "", bufferOffset: state.bufferOffset + raw.length };
      return [];
    },
    drainDiagnostics() {
      const out = diagnostics.slice();
      diagnostics.length = 0;
      return out;
    },
  };
}

function markerNameFromIncomplete(raw: string): string {
  return raw.match(/^<([a-zA-Z_][\w-]*)/)?.[1] ?? "<incomplete-marker>";
}

// ─── Convenience: parse a complete text non-streaming ─────────────────

export function parseAllMarkers(
  text: string,
  options: StreamingParserOptions,
): { events: ReadonlyArray<ParsedMarkerEvent>; diagnostics: ReadonlyArray<ParserDiagnostic> } {
  const parser = createStreamingParser(options);
  const events = [...parser.feed(text), ...parser.flush()];
  const diagnostics = parser.drainDiagnostics();
  return { events, diagnostics };
}

// ─── Layer 1 — JSON parse ─────────────────────────────────────────────

/**
 * Try to parse the input as JSON and validate against a schema. Used when the
 * model is instructed to emit pure JSON, or when the input is a fenced ```json
 * code block (fences must be stripped by the caller).
 */
export function tryJsonParse<T>(
  text: string,
  schema: ZodType<T>,
  schemaName: string,
): { success: true; data: T } | { success: false; diagnostic: OutputValidationFailedDiagnostic } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      success: false,
      diagnostic: {
        type: "output_validation_failed",
        markerName: "<json-input>",
        schema: schemaName,
        error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
        raw: text,
        layer: 1,
      },
    };
  }

  const result = validateOutput(schema, parsed);
  if (result.valid) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    diagnostic: {
      type: "output_validation_failed",
      markerName: "<json-input>",
      schema: schemaName,
      error: result.error,
      raw: result.raw,
      layer: 1,
    },
  };
}
