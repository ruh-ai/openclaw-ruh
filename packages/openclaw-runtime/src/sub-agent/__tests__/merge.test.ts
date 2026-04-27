import { describe, expect, test } from "bun:test";
import type { MergePolicyRule } from "../../orchestrator/types";
import {
  buildMergeResult,
  detectConflictPaths,
  detectFileConflicts,
} from "../merge";
import type { SubAgentCompletion, SubAgentResult } from "../types";

function mkResult(over: Partial<SubAgentResult> = {}): SubAgentResult {
  return {
    success: over.success ?? true,
    files_written: over.files_written ?? [],
    output_summary: over.output_summary ?? "ok",
    emitted_events: over.emitted_events ?? [],
    decision_count: over.decision_count ?? 0,
    ...(over.error !== undefined ? { error: over.error } : {}),
    ...(over.error_category !== undefined
      ? { error_category: over.error_category }
      : {}),
  };
}

function mkCompletion(
  specialist: string,
  files: string[],
  opts: { required?: boolean; success?: boolean } = {},
): SubAgentCompletion {
  return {
    specialist,
    required: opts.required ?? true,
    result: mkResult({ files_written: files, success: opts.success ?? true }),
  };
}

describe("detectConflictPaths", () => {
  test("returns empty when no path is multi-writer", () => {
    const map = detectConflictPaths([
      mkCompletion("intake", ["a.md"]),
      mkCompletion("takeoff", ["b.md"]),
    ]);
    expect(map.size).toBe(0);
  });

  test("path written by 2+ specialists is a conflict", () => {
    const map = detectConflictPaths([
      mkCompletion("intake", ["shared.md"]),
      mkCompletion("takeoff", ["shared.md", "b.md"]),
    ]);
    expect(map.size).toBe(1);
    expect(map.get("shared.md")).toEqual(["intake", "takeoff"]);
  });

  test("a single specialist writing the same path twice is NOT a conflict", () => {
    const map = detectConflictPaths([
      mkCompletion("intake", ["a.md", "a.md"]),
    ]);
    expect(map.size).toBe(0);
  });

  test("failed sub-agents' file_writes are ignored for conflict detection", () => {
    const map = detectConflictPaths([
      mkCompletion("intake", ["shared.md"]),
      mkCompletion("takeoff", ["shared.md"], { success: false }),
    ]);
    // Only one successful writer, so no conflict.
    expect(map.size).toBe(0);
  });
});

describe("detectFileConflicts — apply merge policy", () => {
  const policy: ReadonlyArray<MergePolicyRule> = [
    { path_glob: ".openclaw/architecture.json", resolution: "error" },
    { path_glob: "deliverables/decision-log.md", resolution: "explicit-merge" },
    { path_glob: "deliverables/**", resolution: "last-write-wins" },
  ];

  test("specific path → specific resolution", () => {
    const conflicts = detectFileConflicts(
      [
        mkCompletion("a", [".openclaw/architecture.json"]),
        mkCompletion("b", [".openclaw/architecture.json"]),
      ],
      policy,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.resolution).toBe("error");
  });

  test("falls through to broader glob", () => {
    const conflicts = detectFileConflicts(
      [
        mkCompletion("a", ["deliverables/intake/foo.md"]),
        mkCompletion("b", ["deliverables/intake/foo.md"]),
      ],
      policy,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.resolution).toBe("last-write-wins");
  });

  test("path with no matching policy defaults to last-write-wins", () => {
    const conflicts = detectFileConflicts(
      [
        mkCompletion("a", ["other/path.md"]),
        mkCompletion("b", ["other/path.md"]),
      ],
      policy,
    );
    expect(conflicts[0]?.resolution).toBe("last-write-wins");
  });
});

describe("buildMergeResult", () => {
  const policy: ReadonlyArray<MergePolicyRule> = [
    { path_glob: ".openclaw/**", resolution: "error" },
    { path_glob: "deliverables/**", resolution: "last-write-wins" },
  ];

  test("all required succeed → success", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("intake", ["a.md"]),
        mkCompletion("takeoff", ["b.md"]),
      ],
      mergePolicy: policy,
    });
    expect(r.success).toBe(true);
    expect(r.partial_completion).toBe(false);
    expect(r.total_files).toBe(2);
    expect(r.conflicts).toHaveLength(0);
    expect(r.failed_required).toBeUndefined();
    expect(r.failed_optional).toBeUndefined();
  });

  test("required failure → success false + partial_completion true if some succeeded", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("intake", ["a.md"]),
        mkCompletion("takeoff", [], { success: false }),
      ],
      mergePolicy: policy,
    });
    expect(r.success).toBe(false);
    expect(r.partial_completion).toBe(true);
    expect(r.failed_required).toEqual(["takeoff"]);
  });

  test("optional failure → success true; failed_optional populated", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("intake", ["a.md"]),
        mkCompletion("rfq-sealant", [], { required: false, success: false }),
      ],
      mergePolicy: policy,
    });
    expect(r.success).toBe(true);
    expect(r.partial_completion).toBe(true);
    expect(r.failed_optional).toEqual(["rfq-sealant"]);
    expect(r.failed_required).toBeUndefined();
  });

  test("`error` resolution conflict forces success=false", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("a", [".openclaw/architecture.json"]),
        mkCompletion("b", [".openclaw/architecture.json"]),
      ],
      mergePolicy: policy,
    });
    expect(r.success).toBe(false);
    expect(r.conflicts[0]?.resolution).toBe("error");
  });

  test("empty completions list → success false (nothing to merge)", () => {
    const r = buildMergeResult({ completions: [], mergePolicy: policy });
    expect(r.success).toBe(false);
    expect(r.total_files).toBe(0);
    expect(r.partial_completion).toBe(false);
  });

  test("total_files counts unique paths across successful writers", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("a", ["x.md", "y.md"]),
        mkCompletion("b", ["x.md", "z.md"]), // x.md is dup
      ],
      mergePolicy: policy,
    });
    expect(r.total_files).toBe(3);
  });

  test("agent_results carries every specialist's summary", () => {
    const r = buildMergeResult({
      completions: [
        mkCompletion("intake", ["a.md"]),
        mkCompletion("takeoff", []),
      ],
      mergePolicy: policy,
    });
    expect(r.agent_results.map((a) => a.specialist)).toEqual([
      "intake",
      "takeoff",
    ]);
    expect(r.agent_results[0]?.files_written).toBe(1);
  });
});
