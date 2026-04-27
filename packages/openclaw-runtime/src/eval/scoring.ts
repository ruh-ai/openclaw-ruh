/**
 * Scoring helpers — pure, deterministic.
 *
 * Implements: docs/spec/openclaw-v1/008-eval-task.md §judge-kinds
 *
 * Substrate-side scoring covers the deterministic kinds: `exact` and
 * `structural`. The `semantic` judge requires an LLM call (runtime
 * concern, not substrate). The `composite` judge is a weighted sum over
 * sub-judges — the runtime invokes each, the substrate combines results.
 */

import type { EvalRubric, EvalRubricDimension } from "./types";

// ─── Scoring result ───────────────────────────────────────────────────

export interface JudgeOutcome {
  /** True iff this judge considers the actual output a pass. */
  readonly pass: boolean;
  /** Normalized 0..1 confidence; runtime reports this as task.confidence. */
  readonly confidence: number;
  /** Free-form reason (test-friendly + dashboard-rendered). */
  readonly reason: string;
  /** Per-dimension breakdown, when a rubric was applied. */
  readonly dimensions?: ReadonlyArray<DimensionScore>;
}

export interface DimensionScore {
  readonly name: string;
  /** Raw score on the dimension's declared scale. */
  readonly score: number;
  /** Normalized 0..1 (score / scale.max-min) for cross-dimension averaging. */
  readonly normalized: number;
}

// ─── exact judge ──────────────────────────────────────────────────────

/**
 * Byte-equal comparison. Returns confidence 1 on full match; 0 otherwise.
 */
export function scoreExact(expected: string, actual: string): JudgeOutcome {
  const pass = expected === actual;
  return {
    pass,
    confidence: pass ? 1 : 0,
    reason: pass
      ? "exact match"
      : `byte mismatch: expected ${expected.length} chars, got ${actual.length}`,
  };
}

// ─── structural judge ─────────────────────────────────────────────────

/**
 * Deep structural comparison. The expected shape is a partial template:
 * keys present in `expected` must exist in `actual` with equal-shaped
 * values. Keys present in `actual` but not in `expected` are tolerated
 * (partial match — the actual may carry extra fields).
 *
 * For arrays: same length AND element-wise structural match required.
 * Numeric tolerance is NOT applied here — that's the rubric's job; the
 * structural judge is exact-equality on values.
 */
export function scoreStructural(
  expected: unknown,
  actual: unknown,
): JudgeOutcome {
  const issues: string[] = [];
  walk(expected, actual, "", issues);
  return issues.length === 0
    ? { pass: true, confidence: 1, reason: "structural match" }
    : {
        pass: false,
        confidence: 0,
        reason: `structural mismatch: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ""}`,
      };
}

function walk(
  expected: unknown,
  actual: unknown,
  path: string,
  issues: string[],
): void {
  if (expected === null) {
    if (actual !== null) issues.push(`${path || "<root>"}: expected null`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      issues.push(`${path || "<root>"}: expected array`);
      return;
    }
    if (expected.length !== actual.length) {
      issues.push(
        `${path || "<root>"}: array length ${actual.length} ≠ expected ${expected.length}`,
      );
      return;
    }
    for (let i = 0; i < expected.length; i++) {
      walk(expected[i], actual[i], `${path}[${i}]`, issues);
    }
    return;
  }
  if (typeof expected === "object") {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
      issues.push(`${path || "<root>"}: expected object`);
      return;
    }
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;
    for (const k of Object.keys(expObj)) {
      if (!(k in actObj)) {
        issues.push(`${path}.${k}: missing key`);
        continue;
      }
      walk(expObj[k], actObj[k], path ? `${path}.${k}` : k, issues);
    }
    return;
  }
  // Primitive (string, number, boolean, undefined).
  if (expected !== actual) {
    issues.push(
      `${path || "<root>"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ─── rubric — average normalized scores against pass_threshold ────────

export interface RubricScoreInput {
  readonly rubric: EvalRubric;
  /**
   * Per-dimension raw scores. Missing dimensions count as 0 (max penalty).
   * The runtime supplies these from the judge LLM's structured output.
   */
  readonly scores: Readonly<Record<string, number>>;
}

/**
 * Apply a rubric: normalize each dimension's score to 0..1, sum, compare
 * against pass_threshold. The threshold is interpreted as a sum on the
 * raw (un-normalized) scale per spec — `pass_threshold: 24` against three
 * dimensions on 0..10 means "raw sum ≥ 24."
 *
 * `pass` is the literal threshold check; `confidence` is the normalized
 * average so the runtime can compare confidences across rubrics with
 * different scales.
 */
export function scoreRubric(input: RubricScoreInput): JudgeOutcome {
  const { rubric, scores } = input;
  const dimensions: DimensionScore[] = [];
  let rawSum = 0;
  let normalizedSum = 0;
  for (const dim of rubric.dimensions) {
    const raw = scores[dim.name] ?? 0;
    const normalized = normalizeScore(raw, dim);
    dimensions.push({ name: dim.name, score: raw, normalized });
    rawSum += raw;
    normalizedSum += normalized;
  }
  const pass = rawSum >= rubric.pass_threshold;
  const confidence =
    rubric.dimensions.length > 0 ? normalizedSum / rubric.dimensions.length : 0;
  return {
    pass,
    confidence: clamp01(confidence),
    reason: pass
      ? `rubric sum ${rawSum} ≥ threshold ${rubric.pass_threshold}`
      : `rubric sum ${rawSum} < threshold ${rubric.pass_threshold}`,
    dimensions,
  };
}

function normalizeScore(score: number, dim: EvalRubricDimension): number {
  const span = dim.scale.max - dim.scale.min;
  if (span <= 0) return 0;
  const fraction = (score - dim.scale.min) / span;
  return clamp01(fraction);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ─── composite — weighted sum over sub-judge outcomes ─────────────────

export interface CompositeOutcomeInput {
  /** Per-sub-judge outcomes, keyed by the same names used in `weights`. */
  readonly subOutcomes: Readonly<Record<string, JudgeOutcome>>;
  /** Weights from EvalJudge.weights (default `1` for any name missing). */
  readonly weights: Readonly<Record<string, number>>;
  /** Threshold the weighted confidence must exceed for `pass`. */
  readonly acceptanceThreshold: number;
}

/**
 * Combine sub-judge outcomes per spec §composite-example. Composite
 * passes iff weighted-confidence ≥ acceptanceThreshold AND every
 * sub-judge with a `rubric.pass_threshold` passes its threshold (the
 * latter is enforced by the sub-outcome's own `pass` flag).
 */
export function scoreComposite(input: CompositeOutcomeInput): JudgeOutcome {
  const { subOutcomes, weights, acceptanceThreshold } = input;
  let weightedConfidence = 0;
  let totalWeight = 0;
  let allSubPassed = true;
  const reasonParts: string[] = [];
  for (const [name, outcome] of Object.entries(subOutcomes)) {
    const w = weights[name] ?? 1;
    weightedConfidence += w * outcome.confidence;
    totalWeight += w;
    if (!outcome.pass) {
      allSubPassed = false;
      reasonParts.push(`${name}:fail`);
    } else {
      reasonParts.push(`${name}:pass`);
    }
  }
  const normalized =
    totalWeight > 0 ? weightedConfidence / totalWeight : 0;
  const pass = allSubPassed && normalized >= acceptanceThreshold;
  return {
    pass,
    confidence: clamp01(normalized),
    reason: pass
      ? `composite ${normalized.toFixed(3)} ≥ ${acceptanceThreshold} (${reasonParts.join(", ")})`
      : `composite ${normalized.toFixed(3)} < ${acceptanceThreshold} or sub-judge failed (${reasonParts.join(", ")})`,
  };
}

// ─── tolerance helper for numeric dimensions ──────────────────────────

/**
 * True iff `actual` is within `tolerance_percent` of `expected`. For
 * `expected = 0` (degenerate), only an exact zero passes. Used by judges
 * that score numeric quantities (ECC takeoff numbers, labor totals).
 */
export function withinTolerance(
  expected: number,
  actual: number,
  tolerance_percent: number,
): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  if (tolerance_percent < 0) return false;
  if (expected === 0) return actual === 0;
  const allowedDelta = Math.abs(expected) * (tolerance_percent / 100);
  return Math.abs(actual - expected) <= allowedDelta;
}
