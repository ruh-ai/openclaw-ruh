import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  MarkerSchemaRegistry,
  validateOutput,
  createStreamingParser,
  parseAllMarkers,
  tryJsonParse,
} from "../structured-output-parser";

const TestSchema = z.object({ id: z.string().min(1), count: z.number().int() }).strict();
const NoStrictSchema = z.object({ flag: z.boolean() });

function makeRegistry() {
  const r = new MarkerSchemaRegistry();
  r.bind({ markerName: "test", schemaName: "TestSchema", schema: TestSchema });
  r.bind({ markerName: "no_strict", schemaName: "NoStrictSchema", schema: NoStrictSchema });
  return r;
}

describe("MarkerSchemaRegistry", () => {
  test("bind + get + has + list", () => {
    const r = new MarkerSchemaRegistry();
    r.bind({ markerName: "x", schemaName: "X", schema: z.object({}) });
    expect(r.has("x")).toBe(true);
    expect(r.get("x")?.schemaName).toBe("X");
    expect(r.list()).toHaveLength(1);
  });

  test("bind throws on duplicate marker name", () => {
    const r = new MarkerSchemaRegistry();
    r.bind({ markerName: "x", schemaName: "X", schema: z.object({}) });
    expect(() => r.bind({ markerName: "x", schemaName: "Y", schema: z.object({}) })).toThrow(
      /already bound/,
    );
  });
});

describe("validateOutput", () => {
  test("valid: returns parsed data", () => {
    const result = validateOutput(TestSchema, { id: "a", count: 1 });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data).toEqual({ id: "a", count: 1 });
  });

  test("invalid: returns aggregated zod issue messages + raw input", () => {
    const result = validateOutput(TestSchema, { id: "", count: "not a number" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("id:");
      expect(result.error).toContain("count:");
      expect(result.raw).toEqual({ id: "", count: "not a number" });
    }
  });
});

describe("createStreamingParser — happy path", () => {
  test("extracts validated markers", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    const events = parser.feed('<test id="x" count="1"/>');
    expect(events).toHaveLength(1);
    expect(events[0]?.value).toEqual({ id: "x", count: 1 }); // count was JSON-parsed from "1" → 1
  });

  test("deduplicates identical markers", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    const e1 = parser.feed('<test id="x" count="1"/>');
    expect(e1).toHaveLength(1);
    const e2 = parser.feed('<test id="x" count="1"/>');
    expect(e2).toHaveLength(0); // deduped
  });

  test("does NOT dedup when attributes differ", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    const e1 = parser.feed('<test id="x" count="1"/>');
    const e2 = parser.feed('<test id="x" count="2"/>');
    expect(e1).toHaveLength(1);
    expect(e2).toHaveLength(1);
  });

  test("streaming across deltas produces events at the right delta", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    expect(parser.feed("<test id=")).toHaveLength(0);
    expect(parser.feed('"x" ')).toHaveLength(0);
    expect(parser.feed('count="1"/>')).toHaveLength(1);
  });
});

describe("createStreamingParser — diagnostics (spec 015 silent-drop forbidden)", () => {
  test("validation failure produces a typed diagnostic", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    const events = parser.feed('<test id="" count="not_a_number"/>');
    expect(events).toHaveLength(0); // no event emitted

    const diags = parser.drainDiagnostics();
    expect(diags).toHaveLength(1);
    const d = diags[0];
    expect(d?.type).toBe("output_validation_failed");
    if (d?.type === "output_validation_failed") {
      expect(d.markerName).toBe("test");
      expect(d.schema).toBe("TestSchema");
      expect(d.layer).toBe(2);
      expect(d.error).toContain("count");
    }
  });

  test("unregistered marker produces diagnostic by default", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    const events = parser.feed('<unknown_marker x="1"/>');
    expect(events).toHaveLength(0);

    const diags = parser.drainDiagnostics();
    expect(diags).toHaveLength(1);
    const d = diags[0];
    if (d?.type === "output_validation_failed") {
      expect(d.markerName).toBe("unknown_marker");
      expect(d.schema).toBe("<unregistered>");
    }
  });

  test("passUnregisteredMarkers=true allows unregistered markers through", () => {
    const parser = createStreamingParser({
      registry: makeRegistry(),
      passUnregisteredMarkers: true,
    });
    const events = parser.feed('<unknown_marker x="1"/>');
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("unknown_marker");
    expect(parser.drainDiagnostics()).toHaveLength(0);
  });

  test("drainDiagnostics returns then clears the buffer", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    parser.feed('<test id="" count="1"/>'); // produces diagnostic
    const first = parser.drainDiagnostics();
    expect(first).toHaveLength(1);
    const second = parser.drainDiagnostics();
    expect(second).toHaveLength(0);
  });
});

describe("createStreamingParser — flush", () => {
  test("flush drains buffer at end of stream", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    parser.feed('<test id="x" count="1"');
    // No closing yet — flush completes the tag
    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.value).toEqual({ id: "x", count: 1 });
  });

  test("flush is safe when buffer is empty", () => {
    const parser = createStreamingParser({ registry: makeRegistry() });
    expect(parser.flush()).toHaveLength(0);
  });
});

describe("parseAllMarkers (non-streaming convenience)", () => {
  test("parses multiple markers with diagnostics", () => {
    const text =
      '<test id="a" count="1"/> prose <test id="" count="2"/> more <test id="b" count="3"/>';
    const { events, diagnostics } = parseAllMarkers(text, { registry: makeRegistry() });

    expect(events).toHaveLength(2);
    expect(events[0]?.value).toEqual({ id: "a", count: 1 });
    expect(events[1]?.value).toEqual({ id: "b", count: 3 });

    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0];
    if (d?.type === "output_validation_failed") {
      expect(d.error).toContain("id");
    }
  });
});

describe("tryJsonParse (Layer 1)", () => {
  test("parses valid JSON matching schema", () => {
    const result = tryJsonParse('{"id":"x","count":1}', TestSchema, "TestSchema");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ id: "x", count: 1 });
  });

  test("returns layer-1 diagnostic on JSON parse failure", () => {
    const result = tryJsonParse("not json", TestSchema, "TestSchema");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.diagnostic.type).toBe("output_validation_failed");
      expect(result.diagnostic.layer).toBe(1);
      expect(result.diagnostic.error).toContain("JSON.parse");
    }
  });

  test("returns layer-1 diagnostic on schema validation failure", () => {
    const result = tryJsonParse('{"id":"","count":"x"}', TestSchema, "TestSchema");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.diagnostic.layer).toBe(1);
      expect(result.diagnostic.schema).toBe("TestSchema");
    }
  });
});
