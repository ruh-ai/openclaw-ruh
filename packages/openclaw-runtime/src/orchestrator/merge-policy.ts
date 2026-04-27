/**
 * Merge policy resolver — pure, deterministic.
 *
 * Implements: docs/spec/openclaw-v1/006-orchestrator.md §file-conflicts
 *
 * Given a workspace path + a `MergePolicyRule[]` declaration, returns the
 * resolution strategy. Globs evaluated in declaration order — first match
 * wins. The merger that ACTUALLY applies the resolution (e.g. last-write-
 * wins overwriting one specialist's file with another's) lives in Phase
 * 2c; the substrate ships the rule lookup so every implementation
 * resolves the same path the same way.
 *
 * Glob grammar (minimal subset matching the spec examples):
 *   *      — matches a single path segment (no `/`)
 *   **     — matches zero or more path segments (any depth)
 *   /      — literal path separator
 *   <other> — literal character
 *
 * Examples that work:
 *   `.openclaw/architecture.json`     — exact match
 *   `deliverables/*.md`               — single-level .md
 *   `deliverables/**`                 — anything under deliverables/
 *   `deliverables/**\/*.md`           — any .md anywhere under deliverables/
 *   `deliverables/rfq/<trade>.md`     — single segment match (`<trade>` is literal)
 */

import type { MergePolicyRule, MergeResolution } from "./types";

// ─── Public resolver ──────────────────────────────────────────────────

/**
 * Returns the resolution for `path`, or `undefined` when no rule
 * matches. Callers decide what "no rule matches" means — typically the
 * runtime's default (last-write-wins) — but the substrate doesn't
 * guess; it surfaces the absence so misconfiguration can be detected.
 */
export function resolveMergePolicy(
  rules: ReadonlyArray<MergePolicyRule>,
  path: string,
): MergeResolution | undefined {
  for (const rule of rules) {
    if (matchGlob(rule.path_glob, path)) return rule.resolution;
  }
  return undefined;
}

// ─── Glob matcher ─────────────────────────────────────────────────────

/**
 * True iff `path` matches `glob` per the grammar above. Compiles the
 * glob to a RegExp once per call; callers that need bulk evaluation
 * should `compileGlob` once and reuse.
 */
export function matchGlob(glob: string, path: string): boolean {
  return compileGlob(glob).test(path);
}

/**
 * Compile a glob to a RegExp. Exposed for callers that want to evaluate
 * the same glob against many paths without re-compiling.
 *
 * Token grammar (recognised in this order; longest-match wins):
 *   `**\/`  at start   → `(?:.*\/)?`   — zero or more leading segments + slash
 *   `/**\/` in middle  → `\/(?:.*\/)?` — slash + zero or more segments + slash
 *   `/**`   at end     → `(?:\/.*)?`   — empty or slash + anything
 *   `**`    bare       → `.*`          — anything across separators
 *   `*`                → `[^/]*`        — single segment, no separator
 *   `c`                → escaped literal
 *
 * The previous implementation walked single chars and post-hoc tried to
 * detect `**` neighbours, which double-emitted the boundary `/` when it
 * encountered `<prefix>/**` at end-of-string. The token-based form looks
 * ahead before emitting any `/` so `deliverables/**` compiles correctly.
 */
export function compileGlob(glob: string): RegExp {
  let out = "";
  let i = 0;

  // 1. Leading "**/" — zero or more leading segments + slash.
  if (glob.startsWith("**/")) {
    out += "(?:.*/)?";
    i = 3;
  }

  while (i < glob.length) {
    const remaining = glob.slice(i);

    // 2. /**/ in middle — slash + zero or more segments + slash.
    if (remaining.startsWith("/**/")) {
      out += "/(?:.*/)?";
      i += 4;
      continue;
    }

    // 3. /** at end — empty or slash + anything.
    if (remaining === "/**") {
      out += "(?:/.*)?";
      i += 3;
      continue;
    }

    // 4. Bare **  (not at start, not adjacent to /).
    if (remaining.startsWith("**")) {
      out += ".*";
      i += 2;
      continue;
    }

    // 5. Single-segment *.
    if (remaining.startsWith("*")) {
      out += "[^/]*";
      i += 1;
      continue;
    }

    // 6. Literal (escaped if regex meta).
    out += escapeRegex(remaining[0]!);
    i += 1;
  }

  return new RegExp(`^${out}$`);
}

const REGEX_META = new Set([
  ".",
  "+",
  "?",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "|",
  "^",
  "$",
  "\\",
]);

function escapeRegex(ch: string): string {
  return REGEX_META.has(ch) ? `\\${ch}` : ch;
}
