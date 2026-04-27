/**
 * Result merging — pure builders.
 *
 * Implements: docs/spec/openclaw-v1/007-sub-agent.md §result-merging
 *
 * Given N completed sub-agents + the pipeline's merge_policy:
 *   - detect file conflicts (paths written by >1 specialist)
 *   - apply per-path resolution policy
 *   - aggregate per-specialist summaries
 *   - compute success / partial_completion / failed_required / failed_optional
 *
 * The orchestrator runtime (Phase 2c) collects sub-agent results and
 * calls these builders. The substrate stays pure — no I/O, no side
 * effects.
 */

import { resolveMergePolicy } from "../orchestrator/merge-policy";
import type {
  FileConflict,
  MergePolicyRule,
  MergeResolution,
} from "../orchestrator/types";
import type {
  MergeAgentSummary,
  MergeResult,
  SubAgentCompletion,
} from "./types";

// ─── Conflict detection ───────────────────────────────────────────────

/**
 * Build a `path → [specialists]` map from the completions. Returns only
 * paths written by 2+ specialists; single-writer paths are not conflicts.
 */
export function detectConflictPaths(
  completions: ReadonlyArray<SubAgentCompletion>,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const map = new Map<string, string[]>();
  for (const c of completions) {
    if (!c.result.success) continue; // failed sub-agents' file_writes don't conflict
    for (const path of c.result.files_written) {
      let agents = map.get(path);
      if (!agents) {
        agents = [];
        map.set(path, agents);
      }
      // Specialist may appear once per path even if it wrote it multiple
      // times; the merge cares about writer-set, not write-count.
      if (!agents.includes(c.specialist)) agents.push(c.specialist);
    }
  }
  // Filter to multi-writer paths only.
  const out = new Map<string, ReadonlyArray<string>>();
  for (const [path, agents] of map.entries()) {
    if (agents.length > 1) out.set(path, agents);
  }
  return out;
}

/**
 * Detect file conflicts and resolve each via the pipeline's
 * merge_policy. Paths matched by no rule are emitted as conflicts with
 * resolution `last-write-wins` — the conservative default per spec.
 */
export function detectFileConflicts(
  completions: ReadonlyArray<SubAgentCompletion>,
  mergePolicy: ReadonlyArray<MergePolicyRule>,
): ReadonlyArray<FileConflict> {
  const paths = detectConflictPaths(completions);
  const conflicts: FileConflict[] = [];
  for (const [path, agents] of paths.entries()) {
    const resolution: MergeResolution =
      resolveMergePolicy(mergePolicy, path) ?? "last-write-wins";
    conflicts.push({ path, agents, resolution });
  }
  return conflicts;
}

// ─── Aggregate builder ────────────────────────────────────────────────

/**
 * Build the full `MergeResult` for an orchestrator turn.
 *
 * `success` is true iff every required sub-agent succeeded AND no
 * conflict resolution is `error`. An `error` resolution always fails the
 * merge — that's the strict per-path policy semantics.
 */
export function buildMergeResult(input: {
  readonly completions: ReadonlyArray<SubAgentCompletion>;
  readonly mergePolicy: ReadonlyArray<MergePolicyRule>;
}): MergeResult {
  const { completions, mergePolicy } = input;
  const conflicts = detectFileConflicts(completions, mergePolicy);

  const agent_results: MergeAgentSummary[] = completions.map((c) => ({
    specialist: c.specialist,
    success: c.result.success,
    files_written: c.result.files_written.length,
    output_summary: c.result.output_summary,
  }));

  const failed_required = completions
    .filter((c) => c.required && !c.result.success)
    .map((c) => c.specialist);
  const failed_optional = completions
    .filter((c) => !c.required && !c.result.success)
    .map((c) => c.specialist);

  const someSucceeded = completions.some((c) => c.result.success);
  const someFailed = completions.some((c) => !c.result.success);
  const partial_completion = someSucceeded && someFailed;

  const hasErrorConflict = conflicts.some((c) => c.resolution === "error");

  const success =
    failed_required.length === 0 && !hasErrorConflict && completions.length > 0;

  // Total files: union of all written paths across successful sub-agents.
  const allPaths = new Set<string>();
  for (const c of completions) {
    if (!c.result.success) continue;
    for (const p of c.result.files_written) allPaths.add(p);
  }

  return {
    success,
    total_files: allPaths.size,
    conflicts,
    agent_results,
    partial_completion,
    ...(failed_required.length > 0 ? { failed_required } : {}),
    ...(failed_optional.length > 0 ? { failed_optional } : {}),
  };
}
