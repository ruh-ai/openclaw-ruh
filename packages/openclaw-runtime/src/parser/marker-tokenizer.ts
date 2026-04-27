/**
 * Marker tokenizer.
 *
 * Implements: docs/spec/openclaw-v1/015-output-validator.md (Layer 2 — state machine)
 *
 * Self-closing XML markers: `<name attr1="value1" attr2='value with spaces'/>`.
 * State-machine parser handles:
 *   - tags spanning multiple delta boundaries (incomplete tags carry forward in buffer)
 *   - escaped quotes inside attribute values (\\", \\')
 *   - both single- and double-quoted attribute values
 *   - JSON-encoded attribute values (parser doesn't decode; consumers may)
 *
 * Replaces the regex-based extraction the harness previously had — regex breaks on
 * quoted JSON in attributes and chunked tags. The state machine is correctness-first.
 */

// ─── Token types ──────────────────────────────────────────────────────

export interface MarkerToken {
  /** Marker name, e.g. "plan_skill", "think_step". */
  readonly name: string;
  /** Attributes as key→value, with backslash-escapes already decoded. */
  readonly attributes: Readonly<Record<string, string>>;
  /** Original raw text of the marker, for debugging and diagnostics. */
  readonly raw: string;
  /** Character offset of the marker's `<` in the full stream. */
  readonly offset: number;
}

export interface TokenizerState {
  /** Accumulated text not yet fully tokenized (may contain incomplete tags). */
  readonly buffer: string;
  /** Offset of `buffer[0]` in the full stream. */
  readonly bufferOffset: number;
}

export interface FeedResult {
  readonly tokens: ReadonlyArray<MarkerToken>;
  readonly state: TokenizerState;
}

// ─── Constructors ─────────────────────────────────────────────────────

export function createTokenizerState(): TokenizerState {
  return { buffer: "", bufferOffset: 0 };
}

// ─── Feed ─────────────────────────────────────────────────────────────

/**
 * Feed a streaming delta into the tokenizer. Returns extracted complete markers
 * and the updated state (which may carry an incomplete tag forward in `buffer`).
 *
 * Self-closing markers only: `<name attr="value"/>`. Opening-then-closing tags
 * (`<x>...</x>`) are not part of v1 marker syntax — they're skipped.
 */
export function feedDelta(state: TokenizerState, delta: string): FeedResult {
  const text = state.buffer + delta;
  const tokens: MarkerToken[] = [];

  let lastConsumed = 0;
  let incompleteStart: number | null = null;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "<") {
      i++;
      continue;
    }

    // Found a `<` — first prove it can start a marker. Prose such as
    // "<plan_skill, parse it" must not swallow the next real marker.
    const nameStart = i + 1;
    const firstNameChar = text[nameStart];
    if (firstNameChar === undefined) {
      incompleteStart = i;
      break;
    }
    if (!isNameStart(firstNameChar)) {
      i++;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (nameEnd < text.length && isNameChar(text[nameEnd] ?? "")) {
      nameEnd++;
    }

    const delimiter = text[nameEnd];
    if (delimiter === undefined) {
      incompleteStart = i;
      break;
    }
    if (delimiter !== "/" && delimiter !== ">" && !/\s/.test(delimiter)) {
      i = nameEnd;
      continue;
    }

    // Candidate marker — scan forward for a complete self-closing tag.
    let j = nameEnd;
    let inQuote = false;
    let quoteChar = "";
    let completed = false;
    let abandoned = false;

    while (j < text.length) {
      const ch = text[j];
      if (inQuote) {
        if (ch === "\\" && j + 1 < text.length) {
          // Backslash-escape: skip next char regardless
          j += 2;
          continue;
        }
        if (ch === quoteChar) inQuote = false;
        j++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        inQuote = true;
        quoteChar = ch;
        j++;
        continue;
      }
      if (ch === "/" && text[j + 1] === ">") {
        // Found self-closing
        const raw = text.slice(i, j + 2);
        const token = parseMarker(raw, state.bufferOffset + i);
        if (token) tokens.push(token);
        lastConsumed = j + 2;
        i = j + 2;
        completed = true;
        break;
      }
      if (ch === ">") {
        // Non-self-closing tag — skip it.
        i = j + 1;
        lastConsumed = i;
        abandoned = true;
        break;
      }
      j++;
    }

    if (completed || abandoned) continue;

    // Reached end of text mid-tag — stop scanning, keep this tag in buffer.
    incompleteStart = i;
    break;
  }

  // Carry forward only a proven incomplete marker candidate. Invalid marker-like
  // prose is discarded so later valid markers can still be extracted.
  let newBuffer: string;
  let newOffset: number;
  if (incompleteStart !== null && incompleteStart >= lastConsumed) {
    newBuffer = text.slice(incompleteStart);
    newOffset = state.bufferOffset + incompleteStart;
  } else {
    newBuffer = "";
    newOffset = state.bufferOffset + text.length;
  }

  return {
    tokens,
    state: { buffer: newBuffer, bufferOffset: newOffset },
  };
}

// ─── Marker parser ────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-zA-Z_][\w-]*$/;
const ATTR_PATTERN = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;

function isNameStart(ch: string): boolean {
  return /^[a-zA-Z_]$/.test(ch);
}

function isNameChar(ch: string): boolean {
  return /^[\w-]$/.test(ch);
}

function parseMarker(raw: string, offset: number): MarkerToken | null {
  // raw is `<name attrs.../>`. Strip wrappers.
  const inner = raw.slice(1, -2).trim();
  // Split on the first run of whitespace (space, tab, newline) — the
  // tokenizer accepts any whitespace at the name/attr boundary, so this
  // must too. Splitting on a literal " " was a bug: a marker like
  // `<plan_skill\nid=.../>` would put the newline + everything after it
  // into `name`, fail NAME_PATTERN, and silently drop the marker.
  const wsMatch = /\s+/.exec(inner);

  let name: string;
  let attrStr: string;

  if (!wsMatch) {
    name = inner;
    attrStr = "";
  } else {
    name = inner.slice(0, wsMatch.index);
    attrStr = inner.slice(wsMatch.index + wsMatch[0].length);
  }

  if (!NAME_PATTERN.test(name)) return null;

  const attributes: Record<string, string> = {};
  if (attrStr) {
    ATTR_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTR_PATTERN.exec(attrStr)) !== null) {
      const key = match[1];
      if (!key) continue;
      const rawValue = match[2] ?? match[3] ?? "";
      // Decode backslash-escapes: \\" → ", \\\\ → \\, \\n → n (single-pass)
      attributes[key] = rawValue.replace(/\\(.)/g, "$1");
    }
  }

  return { name, attributes, raw, offset };
}

// ─── JSON-attribute helper ────────────────────────────────────────────

/**
 * Try to parse an attribute value as JSON. Returns null on parse failure
 * — never throws. Used by structured-output-parser to decode list/object
 * attributes without crashing on malformed input.
 */
export function parseJsonAttribute(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
