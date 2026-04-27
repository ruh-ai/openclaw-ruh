import { describe, expect, test } from "bun:test";
import {
  scoreComposite,
  scoreExact,
  scoreRubric,
  scoreStructural,
  withinTolerance,
} from "../scoring";

describe("scoreExact", () => {
  test("exact match returns confidence 1 + pass true", () => {
    const r = scoreExact("hello", "hello");
    expect(r.pass).toBe(true);
    expect(r.confidence).toBe(1);
  });
  test("any difference returns confidence 0 + pass false", () => {
    const r = scoreExact("hello", "Hello");
    expect(r.pass).toBe(false);
    expect(r.confidence).toBe(0);
  });
});

describe("scoreStructural", () => {
  test("identical objects pass", () => {
    expect(
      scoreStructural({ a: 1, b: "x" }, { a: 1, b: "x" }).pass,
    ).toBe(true);
  });
  test("extra fields in actual tolerated (partial match)", () => {
    expect(
      scoreStructural({ a: 1 }, { a: 1, extra: 2 }).pass,
    ).toBe(true);
  });
  test("missing key in actual fails", () => {
    expect(scoreStructural({ a: 1 }, {}).pass).toBe(false);
  });
  test("primitive mismatch fails", () => {
    expect(scoreStructural({ a: 1 }, { a: 2 }).pass).toBe(false);
  });
  test("array length mismatch fails", () => {
    expect(scoreStructural([1, 2], [1, 2, 3]).pass).toBe(false);
  });
  test("nested structural match", () => {
    expect(
      scoreStructural(
        { outer: { inner: [1, 2] } },
        { outer: { inner: [1, 2], more: "x" } },
      ).pass,
    ).toBe(true);
  });
  test("null preserved", () => {
    expect(scoreStructural({ a: null }, { a: null }).pass).toBe(true);
    expect(scoreStructural({ a: null }, { a: 0 }).pass).toBe(false);
  });
  test("expected array, actual object → fail", () => {
    expect(scoreStructural([1, 2], { 0: 1, 1: 2 }).pass).toBe(false);
  });
  test("issue list trimmed at 5 (with overflow note)", () => {
    const expected = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
    const actual = { a: 9, b: 9, c: 9, d: 9, e: 9, f: 9, g: 9 };
    const r = scoreStructural(expected, actual);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("(+2 more)");
  });
});

describe("scoreRubric", () => {
  const rubric = {
    dimensions: [
      {
        name: "completeness",
        description: "covers buckets",
        scale: { min: 0, max: 10 },
      },
      {
        name: "accuracy",
        description: "no fabrications",
        scale: { min: 0, max: 10 },
      },
      {
        name: "tone",
        description: "matches voice",
        scale: { min: 0, max: 10 },
      },
    ],
    pass_threshold: 24,
  };

  test("sum ≥ threshold passes", () => {
    const r = scoreRubric({
      rubric,
      scores: { completeness: 8, accuracy: 8, tone: 9 },
    });
    expect(r.pass).toBe(true);
    expect(r.dimensions).toHaveLength(3);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
  test("sum < threshold fails", () => {
    const r = scoreRubric({
      rubric,
      scores: { completeness: 5, accuracy: 5, tone: 5 },
    });
    expect(r.pass).toBe(false);
    expect(r.confidence).toBeCloseTo(0.5, 2);
  });
  test("missing score for a dimension counts as 0", () => {
    const r = scoreRubric({
      rubric,
      scores: { completeness: 10, accuracy: 10 }, // tone missing
    });
    expect(r.pass).toBe(false);
    const tone = r.dimensions?.find((d) => d.name === "tone");
    expect(tone?.score).toBe(0);
  });
  test("score above scale.max clamps the normalized confidence to 1", () => {
    const r = scoreRubric({
      rubric: {
        dimensions: [
          {
            name: "x",
            description: "y",
            scale: { min: 0, max: 10 },
          },
        ],
        pass_threshold: 5,
      },
      scores: { x: 100 },
    });
    expect(r.confidence).toBe(1);
  });
});

describe("scoreComposite", () => {
  test("weighted sum ≥ threshold AND every sub passed → pass", () => {
    const r = scoreComposite({
      subOutcomes: {
        quantities: { pass: true, confidence: 1, reason: "ok" },
        narrative: { pass: true, confidence: 0.8, reason: "ok" },
      },
      weights: { quantities: 0.6, narrative: 0.4 },
      acceptanceThreshold: 0.75,
    });
    expect(r.pass).toBe(true);
  });

  test("any sub failure forces composite to fail", () => {
    const r = scoreComposite({
      subOutcomes: {
        quantities: { pass: false, confidence: 0.4, reason: "off" },
        narrative: { pass: true, confidence: 1, reason: "ok" },
      },
      weights: { quantities: 0.5, narrative: 0.5 },
      acceptanceThreshold: 0.5,
    });
    expect(r.pass).toBe(false);
  });

  test("missing weight defaults to 1 (equal weight)", () => {
    const r = scoreComposite({
      subOutcomes: {
        a: { pass: true, confidence: 1, reason: "" },
        b: { pass: true, confidence: 0, reason: "" },
      },
      weights: {}, // both default to 1
      acceptanceThreshold: 0.4,
    });
    // average of 1 and 0 = 0.5 ≥ 0.4 AND both pass true
    expect(r.pass).toBe(true);
  });

  test("threshold above weighted sum fails even with all subs passing", () => {
    const r = scoreComposite({
      subOutcomes: {
        a: { pass: true, confidence: 0.5, reason: "" },
      },
      weights: { a: 1 },
      acceptanceThreshold: 0.6,
    });
    expect(r.pass).toBe(false);
  });
});

describe("withinTolerance", () => {
  test("exact match always within any non-negative tolerance", () => {
    expect(withinTolerance(100, 100, 0)).toBe(true);
    expect(withinTolerance(100, 100, 5)).toBe(true);
  });
  test("5% tolerance: 100 vs 104 passes, 100 vs 106 fails", () => {
    expect(withinTolerance(100, 104, 5)).toBe(true);
    expect(withinTolerance(100, 106, 5)).toBe(false);
  });
  test("expected=0 — only exact zero passes", () => {
    expect(withinTolerance(0, 0, 100)).toBe(true);
    expect(withinTolerance(0, 0.01, 100)).toBe(false);
  });
  test("negative expected handled by absolute value", () => {
    expect(withinTolerance(-100, -104, 5)).toBe(true);
    expect(withinTolerance(-100, -106, 5)).toBe(false);
  });
  test("non-finite inputs return false", () => {
    expect(withinTolerance(Number.NaN, 1, 5)).toBe(false);
    expect(withinTolerance(1, Number.POSITIVE_INFINITY, 5)).toBe(false);
  });
});
