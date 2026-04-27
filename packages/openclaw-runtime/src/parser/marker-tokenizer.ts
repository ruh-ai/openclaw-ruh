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
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "<") {
      i++;
      continue;
    }

    // Found a `<` — scan forward for a complete self-closing tag.
    let j = i + 1;
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
    break;
  }

  // Carry forward whatever's after the last fully-consumed boundary.
  // If there's a `<` past lastConsumed, keep from there (incomplete tag).
  // Otherwise drop the whole prefix.
  const lastOpenTag = text.lastIndexOf("<", text.length - 1);
  let newBuffer: string;
  let newOffset: number;
  if (lastOpenTag >= lastConsumed && lastOpenTag !== -1) {
    newBuffer = text.slice(lastOpenTag);
    newOffset = state.bufferOffset + lastOpenTag;
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

function parseMarker(raw: string, offset: number): MarkerToken | null {
  // raw is `<name attrs.../>`. Strip wrappers.
  const inner = raw.slice(1, -2).trim();
  const spaceIdx = inner.indexOf(" ");

  let name: string;
  let attrStr: string;

  if (spaceIdx === -1) {
    name = inner;
    attrStr = "";
  } else {
    name = inner.slice(0, spaceIdx);
    attrStr = inner.slice(spaceIdx + 1);
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
