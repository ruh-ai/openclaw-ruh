/**
 * Routing matcher — pure, deterministic.
 *
 * Implements: docs/spec/openclaw-v1/006-orchestrator.md §routing-rules
 *
 * Given a `RoutingRules` declaration + a `MatchContext` snapshot of
 * pipeline state, return the first matching rule (or the fallback). No
 * side effects, no async. The runtime orchestrator (Phase 2c) calls this
 * to decide where to hand off; the substrate ships the matcher so every
 * orchestrator implementation evaluates the same rules the same way.
 *
 * Priority handling: rules with higher `priority` win on ties. Within the
 * same priority, declaration order wins. The sort is stable so authors
 * can reason about predictable ordering by writing rules in priority
 * order with priority left at the default 0.
 */

import type {
  MatchAgentStatus,
  MatchClause,
  MatchComparison,
  RoutingRule,
  RoutingRules,
} from "./types";

// ─── MatchContext ─────────────────────────────────────────────────────

/**
 * Snapshot of pipeline state the matcher consults. The runtime assembles
 * this from session state, recent decision-log entries, and incoming
 * input metadata.
 */
export interface MatchContext {
  readonly stage?: string;
  readonly message_kind?: string;
  /** Input "kinds" present in the user's payload (e.g. ["photos", "notes"]). */
  readonly input_has?: ReadonlyArray<string>;
  readonly regions?: ReadonlyArray<string>;
  /** Per-specialist status — what the orchestrator knows about in-flight runs. */
  readonly agent_status?: Readonly<Record<string, MatchAgentStatus>>;
  /** Total decision-log entries this session, for `decision_count` comparisons. */
  readonly decision_count?: number;
  /** Optional bag for custom matchers. */
  readonly extras?: Readonly<Record<string, unknown>>;
}

/** Predicate signature for `match.custom` references resolved by the runtime. */
export type CustomMatcher = (
  match: MatchClause,
  ctx: MatchContext,
) => boolean;

// ─── Match outcome ────────────────────────────────────────────────────

export type RoutingOutcome =
  | { readonly outcome: "matched"; readonly rule: RoutingRule; readonly priority: number }
  | { readonly outcome: "fallback"; readonly fallback: string };

// ─── Public matcher ───────────────────────────────────────────────────

export interface FindRoutingMatchInput {
  readonly rules: RoutingRules;
  readonly context: MatchContext;
  /**
   * Map keyed by `match.custom` reference (the path the manifest declares).
   * The substrate doesn't load handler modules from disk — adapters do
   * that and supply the resolved predicates here.
   */
  readonly customMatchers?: Readonly<Record<string, CustomMatcher>>;
}

export function findRoutingMatch(input: FindRoutingMatchInput): RoutingOutcome {
  const { rules, context, customMatchers } = input;

  // Sort by priority desc; stable so equal-priority rules keep declaration order.
  const indexed = rules.rules.map((rule, index) => ({ rule, index }));
  indexed.sort((a, b) => priorityOf(b.rule) - priorityOf(a.rule));

  for (const { rule } of indexed) {
    if (matchesClause(rule.match, context, customMatchers)) {
      return { outcome: "matched", rule, priority: priorityOf(rule) };
    }
  }
  return { outcome: "fallback", fallback: rules.fallback };
}

function priorityOf(rule: RoutingRule): number {
  return rule.priority ?? 0;
}

// ─── Clause evaluation ────────────────────────────────────────────────

function matchesClause(
  clause: MatchClause,
  ctx: MatchContext,
  customMatchers?: Readonly<Record<string, CustomMatcher>>,
): boolean {
  if (clause.stage !== undefined && clause.stage !== ctx.stage) return false;
  if (
    clause.message_kind !== undefined &&
    clause.message_kind !== ctx.message_kind
  ) {
    return false;
  }
  if (clause.input_has !== undefined && !subset(clause.input_has, ctx.input_has)) {
    return false;
  }
  if (clause.regions !== undefined && !subset(clause.regions, ctx.regions)) {
    return false;
  }
  if (clause.agent_status !== undefined && !matchesAgentStatus(clause.agent_status, ctx)) {
    return false;
  }
  if (
    clause.decision_count !== undefined &&
    !matchesDecisionCount(clause.decision_count, ctx.decision_count)
  ) {
    return false;
  }
  if (clause.custom !== undefined) {
    const matcher = customMatchers?.[clause.custom];
    if (!matcher) {
      // The manifest referenced a custom matcher that wasn't supplied at
      // runtime. Loud failure beats a silent skip — the configuration is
      // broken and the operator needs to know.
      throw new RoutingCustomMatcherUnavailableError(clause.custom);
    }
    if (!matcher(clause, ctx)) return false;
  }
  return true;
}

function subset<T>(
  required: ReadonlyArray<T>,
  available: ReadonlyArray<T> | undefined,
): boolean {
  if (!available) return required.length === 0;
  for (const item of required) {
    if (!available.includes(item)) return false;
  }
  return true;
}

function matchesAgentStatus(
  expected: Readonly<Record<string, MatchAgentStatus>>,
  ctx: MatchContext,
): boolean {
  const have = ctx.agent_status ?? {};
  for (const [agent, status] of Object.entries(expected)) {
    if (have[agent] !== status) return false;
  }
  return true;
}

function matchesDecisionCount(
  thresholds: Readonly<Partial<Record<MatchComparison, number>>>,
  count: number | undefined,
): boolean {
  if (count === undefined) return false;
  for (const [op, value] of Object.entries(thresholds) as Array<[
    MatchComparison,
    number | undefined,
  ]>) {
    if (value === undefined) continue;
    if (!compare(count, op, value)) return false;
  }
  return true;
}

function compare(
  actual: number,
  op: MatchComparison,
  expected: number,
): boolean {
  switch (op) {
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">=":
      return actual >= expected;
    case ">":
      return actual > expected;
  }
}

// ─── Errors ───────────────────────────────────────────────────────────

export class RoutingCustomMatcherUnavailableError extends Error {
  constructor(public readonly customRef: string) {
    super(
      `routing rule references custom matcher "${customRef}" but no implementation was supplied — pass it via FindRoutingMatchInput.customMatchers`,
    );
    this.name = "RoutingCustomMatcherUnavailableError";
  }
}

// ─── Fan-out parallelism resolution ───────────────────────────────────

/**
 * Per spec §anti-example, the runtime defaults max_parallelism to 4 when
 * neither the fan-out nor RoutingRules.fan_out_default_max_parallelism
 * declares one. Conservative bound on Anthropic concurrency.
 */
export const FAN_OUT_BASELINE = 4;

export function resolveFanOutParallelism(
  rules: RoutingRules,
  ruleCap?: number,
): number {
  return ruleCap ?? rules.fan_out_default_max_parallelism ?? FAN_OUT_BASELINE;
}
