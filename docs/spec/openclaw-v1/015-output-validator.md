# 015 — Output Validator

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/output-validator.schema.json`](schemas/output-validator.schema.json)

LLM output is text. Tools, dashboards, downstream agents, and the decision log expect structured data. The **output validator** is the bridge: a layered parser that turns raw model output into validated, typed objects, with diagnostics on failure rather than silent drops.

---

## Purpose

Every coding-agent-built pipeline produces structured artifacts (architecture plans, skill definitions, employee-profile reveals, build reports, decision-log entries, deliverables). The model produces these inline in chat output, framed by markers like `<plan_skill id="..." name="..."/>` or `<reveal name="..." opening="..."/>`. The runtime extracts and validates these markers before they're forwarded to consumers.

The validator's three jobs:

1. **Stream-safe parsing.** Markers can span delta boundaries (a `<` arrives in one chunk, the closing `/>` in the next). The parser handles this without losing markers.
2. **Schema validation.** Every marker the runtime trusts has a Zod schema. Markers that fail schema produce a typed diagnostic, not a silently dropped event.
3. **Layered fallback.** When markers don't appear cleanly, the parser falls back through tiers (JSON parse → marker tokenizer → heuristic extraction) before giving up.

## Three-layer parser

Output is processed in this order. Each layer is tried independently; the first success wins.

```
┌──────────────────────────────────────────────────────────┐
│ Layer 1 — JSON parse                                     │
│   if response is structured JSON, parse + validate       │
│   useful when the model emits {"plan": {...}} directly   │
├──────────────────────────────────────────────────────────┤
│ Layer 2 — Marker tokenizer (state machine)               │
│   extract self-closing XML markers from streamed text    │
│   handles incomplete tags across delta boundaries        │
│   handles escaped quotes in JSON-encoded attributes      │
├──────────────────────────────────────────────────────────┤
│ Layer 3 — Heuristic extraction                           │
│   regex/keyword fallback for last-resort extraction      │
│   used only when layers 1+2 fail; flagged in diagnostics │
└──────────────────────────────────────────────────────────┘
```

A pipeline configures the layers it accepts. Most pipelines run all three; some (e.g., a strict-output eval suite) accept only Layer 1.

## Layer 1 — JSON parse

Input: the full assistant message (or a substring delimited by triple-backtick fences).
Process: `JSON.parse` → validate with the target Zod schema.
Output: typed object on success; null on parse failure (falls through to Layer 2).

JSON parsing is the cleanest path. It's used when:

- The model is instructed to emit pure JSON (no surrounding prose)
- The model emits a fenced code block tagged `json` containing the structured data
- A tool returns JSON in its `output` field (already structured)

## Layer 2 — Marker tokenizer

Most assistant output is prose with embedded markers. The tokenizer extracts self-closing XML markers via a state machine, not regex.

### Marker syntax

```
<marker_name attr1="value1" attr2='value with apostrophes' attr3="json-encoded\"escapes\""/>
```

- Marker name: `^[a-zA-Z_][\w-]*$` (alphanumeric + `-` + `_`, must start with letter or underscore)
- Attributes: `key="value"` or `key='value'`, separated by whitespace
- Attribute values: arbitrary strings; backslash-escapes (`\"`, `\'`, `\\`) preserved
- Self-closing only: `<name .../>` — opening-then-closing tags are not part of v1 marker syntax
- Tag content (text between open/close) is not extracted; markers are attribute-only

### State machine

The tokenizer maintains:

```ts
interface TokenizerState {
  buffer: string;        // accumulated unconsumed text
  bufferOffset: number;  // offset of buffer start in the full stream
}
```

`feedDelta(state, delta)` returns:

```ts
interface FeedResult {
  tokens: MarkerToken[];     // complete markers extracted from this delta + buffer
  state: TokenizerState;     // updated buffer (may carry incomplete tag forward)
}
```

Each token:

```ts
interface MarkerToken {
  name: string;
  attributes: Record<string, string>;  // unescaped values
  raw: string;                          // original text for debugging
  offset: number;                        // position in the full stream
}
```

### Why a state machine, not regex

Regex extraction breaks on:

- Quotes inside attribute values: `<plan_skill name="\"Foo\" agent"/>`
- Tags spanning chunks: chunk 1 ends with `<plan_skill name=`, chunk 2 starts with `"Foo"/>`
- Nested-looking markers in chat prose: `When you see <plan_skill, parse it`

A state machine handles all three. The tokenizer is ~160 lines (see `parser/marker-tokenizer.ts` in the harness branch); regex would be unbounded. The state machine is the right call.

### `parseJsonAttribute`

For attribute values that should themselves be JSON (lists, nested objects):

```ts
parseJsonAttribute(value: string): unknown | null
```

Returns parsed JSON on success, `null` on failure. **Returns null, never throws** — a malformed JSON attribute is a recoverable diagnostic, not a runtime error.

### Streaming parser

The pipeline wraps the tokenizer with a streaming layer that:

- Maintains tokenizer state across delta calls
- Deduplicates emitted markers (same `name + attributes` won't fire twice)
- Validates each extracted marker against its declared Zod schema
- Emits validated markers as parsed events to consumers

```ts
interface StreamingParser {
  feed(delta: string): ParsedMarkerEvent[];
  flush(): ParsedMarkerEvent[];   // call at end-of-stream to drain buffer
}
```

Consumers see `ParsedMarkerEvent[]`, never raw tokens. Validation happens inside the parser, so malformed markers never reach the orchestrator.

## Layer 3 — Heuristic extraction

When Layers 1+2 fail (e.g., the model emitted prose with no markers and no JSON, but mentioned a name and a description), the runtime can fall back to heuristic regex extraction. This is brittle and explicitly flagged in the decision log:

```ts
{
  type: "parser_fallback",
  layer: 3,
  raw_excerpt: "the agent's name is Claude...",
  extracted: { name: "Claude" },
  confidence: 0.4,
}
```

Confidence below a configurable threshold (default 0.6) suppresses the result entirely; the runtime treats the parse as failed and triggers `malformed_response` recovery (see [014](014-error-taxonomy.md)).

Layer 3 is opt-in per pipeline. Strict pipelines disable it; lenient pipelines (early-stage discovery, exploratory chat) enable it for graceful degradation.

## Schemas

Every marker the runtime trusts has a Zod schema. Adding a new marker = adding its schema. The runtime ships with schemas for the canonical markers:

### `<reveal .../>` — employee profile reveal

```ts
const RevealSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  opening: z.string().min(1),
  what_i_heard: z.array(z.string()),
  what_i_will_own: z.array(z.string()),
  what_i_wont_do: z.array(z.string()),
  first_move: z.string().min(1),
  clarifying_question: z.string().min(1),
});
```

### `<think_step .../>` — reasoning step

```ts
const ThinkStepSchema = z.object({
  step: z.string().min(1),
  status: z.enum(["started", "complete"]),
});
```

### `<think_research_finding .../>`

```ts
const ResearchFindingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  source: z.string().optional(),
});
```

### `<think_document_ready .../>`

```ts
const DocumentReadySchema = z.object({
  docType: z.string().min(1),
  path: z.string().min(1),
});
```

### `<plan_skill .../>`

```ts
const PlanSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  dependencies: z.array(z.string()).optional().default([]),
  toolType: z.string().optional(),
  envVars: z.array(z.string()).optional(),
});
```

### `<plan_workflow .../>`

```ts
const PlanWorkflowSchema = z.object({
  steps: z.array(z.object({
    skillId: z.string().min(1),
    parallel: z.boolean().optional(),
  })),
});
```

### `<deliverable .../>` (custom per pipeline)

For ECC, each of the 10 typed deliverables (Master Package, Takeoff Report, Cost Breakdown, etc.) has its own schema. The pipeline manifest declares these schemas; the runtime validates emitted markers against them.

## `ValidationResult`

```ts
type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string; raw: unknown };
```

The runtime `validateOutput<T>(schema, data)` returns this shape. Consumers branch on `valid` — there is no third state. A failed validation always carries the raw input so debuggers can see what the model produced.

## Diagnostics, not silent drops

When validation fails, the runtime emits a structured diagnostic to the decision log:

```ts
{
  type: "output_validation_failed",
  marker_name: "plan_skill",
  schema: "PlanSkillSchema",
  error: "id: Required; name: String must contain at least 1 character(s)",
  raw: { name: "" },
  layer: 2,
}
```

The agent receives this diagnostic in its next turn (via the recovery action `provide_error_context`) and is expected to retry with corrected output. The dashboard surfaces the diagnostic so humans can see drift between agent output and contract.

**Silent drops are forbidden.** A marker that fails validation must produce a diagnostic. A marker that produces neither validated output nor a diagnostic is a bug in the validator, not in the model.

## Pipeline configuration

A pipeline declares which layers it accepts and which schemas it knows about:

```json
{
  "output_validator": {
    "layers": ["json", "marker", "heuristic"],
    "heuristic_confidence_threshold": 0.6,
    "schemas": [
      { "marker": "reveal", "schema_ref": "openclaw-v1:RevealSchema" },
      { "marker": "plan_skill", "schema_ref": "openclaw-v1:PlanSkillSchema" },
      { "marker": "ecc_deliverable_master_package", "schema_ref": "ecc-v1:MasterPackageSchema" }
    ]
  }
}
```

`schema_ref` resolves to a Zod schema registered in the runtime (canonical schemas) or to a JSON Schema in the pipeline's own `schemas/` directory (custom schemas).

## Examples

### Valid stream

Input deltas (3 chunks):

```
"I've drafted the agent. <plan_skill"
" id=\"intake\" name=\"Intake\" description=\"Pa"
"rses incoming RFPs\"/>"
```

Tokenizer + validator output (after all 3 chunks fed):

```ts
[
  { name: "plan_skill", value: { id: "intake", name: "Intake", description: "Parses incoming RFPs", dependencies: [], envVars: undefined, toolType: undefined } }
]
```

### Stream with malformed marker

Input:

```
"<plan_skill id=\"\" name=\"Intake\"/>"
```

Output:

```ts
// validateOutput returns { valid: false, error: "id: String must contain at least 1 character(s)" }
// Decision log gets: { type: "output_validation_failed", marker_name: "plan_skill", error: "id: ..." }
// No event reaches the orchestrator.
// Recovery action 'provide_error_context' attaches the error to the next prompt.
```

The agent's next turn sees:

```
[PREVIOUS ERROR]
The previous attempt failed with: output_validation_failed for marker plan_skill:
id: String must contain at least 1 character(s)
Please try a different approach.
[/PREVIOUS ERROR]
```

And typically recovers by emitting a corrected `<plan_skill id="intake" .../>`.

### Anti-example — silent drop

A naive parser that doesn't emit diagnostics:

```ts
function parse(text: string) {
  for (const match of text.matchAll(/<(\w+) (.*?)\/>/g)) {  // ❌ regex
    try {
      return validate(match);
    } catch {
      // silently skip                                       // ❌ no diagnostic
    }
  }
}
```

This is what the spec exists to prevent. Failures must surface.

## Cross-references

- [[003-tool-contract]] — tool outputs flow through validators when `outputSchema` is declared
- [[005-decision-log]] — every validation failure produces a typed log entry
- [[013-hooks]] — `output_validation_failed` is hookable for telemetry/alerting
- [[014-error-taxonomy]] — failed validation maps to `malformed_response`
- [[101-conformance]] — fuzzer that asserts validators never silently drop

## Open questions for ECC pipeline

- ECC's 10 typed deliverables (Master Package, RFQ Packet, Decision Log, etc.) — does each get its own marker, or do they share a `<deliverable kind="..."/>` form? **Tentative**: shared marker with `kind` discriminator + `body_ref` to a workspace path; full content travels via `workspace-write` rather than inline in markers (deliverables are too large for inline output).
- For handwritten reMarkable note interpretation, confidence-tiered output ("high / medium / low / unreliable") needs a marker form. **Tentative**: a `<takeoff_reading line_id="..." value="275" unit="gallons" confidence="0.8"/>` marker family with a per-reading schema.
