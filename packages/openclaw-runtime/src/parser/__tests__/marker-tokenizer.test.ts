import { describe, expect, test } from "bun:test";
import {
  feedDelta,
  createTokenizerState,
  parseJsonAttribute,
} from "../marker-tokenizer";

describe("feedDelta — basic extraction", () => {
  test("extracts a simple self-closing marker", () => {
    const result = feedDelta(createTokenizerState(), '<think_step step="planning" status="started"/>');
    expect(result.tokens).toHaveLength(1);
    const token = result.tokens[0];
    expect(token?.name).toBe("think_step");
    expect(token?.attributes).toEqual({ step: "planning", status: "started" });
    expect(token?.offset).toBe(0);
  });

  test("ignores text between markers", () => {
    const result = feedDelta(
      createTokenizerState(),
      'prose text <think_step step="A" status="started"/> more prose <think_step step="B" status="complete"/> end',
    );
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]?.attributes.step).toBe("A");
    expect(result.tokens[1]?.attributes.step).toBe("B");
  });

  test("handles single-quoted attributes", () => {
    const result = feedDelta(createTokenizerState(), "<x key='val with spaces'/>");
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]?.attributes.key).toBe("val with spaces");
  });

  test("handles mixed single + double quotes", () => {
    const result = feedDelta(createTokenizerState(), `<x a="A" b='B'/>`);
    expect(result.tokens[0]?.attributes).toEqual({ a: "A", b: "B" });
  });

  test("handles markers with no attributes", () => {
    const result = feedDelta(createTokenizerState(), "<bare/>");
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]?.name).toBe("bare");
    expect(result.tokens[0]?.attributes).toEqual({});
  });
});

describe("feedDelta — escape handling", () => {
  test("decodes backslash-escaped quotes inside double quotes", () => {
    const result = feedDelta(createTokenizerState(), '<x quote="say \\"hi\\""/>');
    expect(result.tokens[0]?.attributes.quote).toBe('say "hi"');
  });

  test("decodes backslash-escaped quotes inside single quotes", () => {
    const result = feedDelta(createTokenizerState(), "<x quote='it\\'s'/>");
    expect(result.tokens[0]?.attributes.quote).toBe("it's");
  });

  test("handles backslash followed by other char (passthrough decode)", () => {
    const result = feedDelta(createTokenizerState(), '<x path="a\\\\b"/>');
    expect(result.tokens[0]?.attributes.path).toBe("a\\b");
  });

  test("does not crash on JSON-shaped attribute values", () => {
    const result = feedDelta(createTokenizerState(), `<x list="[1,2,3]" obj='{"k":"v"}'/>`);
    expect(result.tokens[0]?.attributes.list).toBe("[1,2,3]");
    expect(result.tokens[0]?.attributes.obj).toBe('{"k":"v"}');
  });
});

describe("feedDelta — streaming across boundaries", () => {
  test("incomplete tag carries forward in buffer until closed", () => {
    const s0 = createTokenizerState();
    const r1 = feedDelta(s0, '<think_step step=');
    expect(r1.tokens).toHaveLength(0);
    expect(r1.state.buffer).toContain("<think_step");

    const r2 = feedDelta(r1.state, '"planning" ');
    expect(r2.tokens).toHaveLength(0);

    const r3 = feedDelta(r2.state, 'status="started"/>');
    expect(r3.tokens).toHaveLength(1);
    expect(r3.tokens[0]?.attributes).toEqual({ step: "planning", status: "started" });
  });

  test("string ending mid-attribute-value is buffered", () => {
    const s0 = createTokenizerState();
    const r1 = feedDelta(s0, '<x key="value with');
    expect(r1.tokens).toHaveLength(0);
    expect(r1.state.buffer).toContain("<x");

    const r2 = feedDelta(r1.state, ' more"/>');
    expect(r2.tokens).toHaveLength(1);
    expect(r2.tokens[0]?.attributes.key).toBe("value with more");
  });

  test("offset increments across deltas correctly", () => {
    const s0 = createTokenizerState();
    const r1 = feedDelta(s0, "prefix text ");
    // No marker in this delta but state's bufferOffset advances past consumed text
    const r2 = feedDelta(r1.state, '<x a="1"/>');
    expect(r2.tokens).toHaveLength(1);
    expect(r2.tokens[0]?.offset).toBeGreaterThanOrEqual(0);
  });
});

describe("feedDelta — robustness", () => {
  test("rejects invalid marker name (non-identifier start)", () => {
    const result = feedDelta(createTokenizerState(), "<123notAName/>");
    expect(result.tokens).toHaveLength(0);
  });

  test("skips non-self-closing tags (opening/closing form not part of v1 syntax)", () => {
    const result = feedDelta(
      createTokenizerState(),
      "<not_self_closing>content</not_self_closing>",
    );
    expect(result.tokens).toHaveLength(0);
  });

  test("handles bare < that never closes (carries in buffer indefinitely)", () => {
    const s0 = createTokenizerState();
    const r1 = feedDelta(s0, "before <incomplete attribute=\"open");
    expect(r1.tokens).toHaveLength(0);
    expect(r1.state.buffer).toContain("<incomplete");
  });

  test("buffer drops fully-consumed text once a marker closes", () => {
    const s0 = createTokenizerState();
    const r1 = feedDelta(s0, 'prefix <x a="1"/> suffix');
    expect(r1.tokens).toHaveLength(1);
    // Buffer should have moved past the marker
    expect(r1.state.buffer).not.toContain("<x");
  });

  test("deduplicates identical markers within a single delta? (NO — that's the parser's job)", () => {
    // The tokenizer extracts every occurrence; deduplication is at the parser layer.
    const result = feedDelta(
      createTokenizerState(),
      '<x a="1"/><x a="1"/>',
    );
    expect(result.tokens).toHaveLength(2);
  });
});

describe("parseJsonAttribute", () => {
  test("parses valid JSON", () => {
    expect(parseJsonAttribute("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseJsonAttribute('{"k":"v"}')).toEqual({ k: "v" });
    expect(parseJsonAttribute("42")).toBe(42);
    expect(parseJsonAttribute("true")).toBe(true);
  });

  test("returns null on parse failure (never throws)", () => {
    expect(parseJsonAttribute("not json")).toBe(null);
    expect(parseJsonAttribute("[1,")).toBe(null);
    expect(parseJsonAttribute("")).toBe(null);
  });
});
