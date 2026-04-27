import { describe, expect, test } from "bun:test";
import { compileGlob, matchGlob, resolveMergePolicy } from "../merge-policy";
import type { MergePolicyRule } from "../types";

describe("compileGlob / matchGlob — exact + segment wildcards", () => {
  test("exact path matches", () => {
    expect(matchGlob(".openclaw/architecture.json", ".openclaw/architecture.json")).toBe(true);
  });

  test("exact path mismatch", () => {
    expect(matchGlob(".openclaw/architecture.json", ".openclaw/different.json")).toBe(
      false,
    );
  });

  test("`*` matches a single segment, not across separators", () => {
    expect(matchGlob("deliverables/*.md", "deliverables/intake.md")).toBe(true);
    expect(matchGlob("deliverables/*.md", "deliverables/sub/intake.md")).toBe(false);
  });

  test("`*` does not match empty path component", () => {
    // `dir/*.md` requires SOMETHING before .md
    expect(matchGlob("deliverables/*.md", "deliverables/.md")).toBe(true);
    // empty dir part rejected
    expect(matchGlob("deliverables/*.md", "deliverables/")).toBe(false);
  });
});

describe("compileGlob / matchGlob — multi-segment globstar", () => {
  test("`**` at end matches anything underneath", () => {
    expect(matchGlob("deliverables/**", "deliverables/intake.md")).toBe(true);
    expect(matchGlob("deliverables/**", "deliverables/sub/intake.md")).toBe(true);
    expect(matchGlob("deliverables/**", "deliverables")).toBe(true);
    expect(matchGlob("deliverables/**", "other/intake.md")).toBe(false);
  });

  test("`**` in middle matches zero or more segments", () => {
    expect(matchGlob("deliverables/**/*.md", "deliverables/foo.md")).toBe(true);
    expect(matchGlob("deliverables/**/*.md", "deliverables/sub/foo.md")).toBe(true);
    expect(matchGlob("deliverables/**/*.md", "deliverables/a/b/c/foo.md")).toBe(true);
    expect(matchGlob("deliverables/**/*.md", "other/foo.md")).toBe(false);
  });

  test("bare `**` matches anything", () => {
    expect(matchGlob("**", "anything")).toBe(true);
    expect(matchGlob("**", "deeply/nested/path.md")).toBe(true);
  });
});

describe("compileGlob — special chars escaped properly", () => {
  test("`.` is treated as literal", () => {
    // Regex `.` would match anything; literal `.` only matches `.`
    expect(matchGlob("a.b", "a.b")).toBe(true);
    expect(matchGlob("a.b", "axb")).toBe(false);
  });

  test("parens in path are literal", () => {
    expect(matchGlob("foo(bar)/x", "foo(bar)/x")).toBe(true);
  });

  test("`+` and `?` are literal", () => {
    expect(matchGlob("a+b", "a+b")).toBe(true);
    expect(matchGlob("a+b", "ab")).toBe(false);
    expect(matchGlob("a?b", "a?b")).toBe(true);
    expect(matchGlob("a?b", "ab")).toBe(false);
  });
});

describe("compileGlob — caching reuse", () => {
  test("compileGlob returns a RegExp callable repeatedly", () => {
    const re = compileGlob("deliverables/**/*.md");
    expect(re.test("deliverables/foo.md")).toBe(true);
    expect(re.test("deliverables/sub/foo.md")).toBe(true);
    expect(re.test("other/foo.md")).toBe(false);
  });
});

describe("resolveMergePolicy — first matching rule wins", () => {
  const rules: ReadonlyArray<MergePolicyRule> = [
    { path_glob: ".openclaw/architecture.json", resolution: "error" },
    { path_glob: "deliverables/decision-log.md", resolution: "explicit-merge" },
    { path_glob: "deliverables/**", resolution: "last-write-wins" },
  ];

  test("exact path matches the specific rule", () => {
    expect(resolveMergePolicy(rules, ".openclaw/architecture.json")).toBe("error");
  });

  test("more-specific rule wins over later glob", () => {
    expect(resolveMergePolicy(rules, "deliverables/decision-log.md")).toBe(
      "explicit-merge",
    );
  });

  test("falls through to broad glob for unrelated paths under deliverables/", () => {
    expect(resolveMergePolicy(rules, "deliverables/intake/report.md")).toBe(
      "last-write-wins",
    );
  });

  test("returns undefined when no rule matches", () => {
    expect(resolveMergePolicy(rules, "skills/intake.md")).toBeUndefined();
  });

  test("empty rules array returns undefined for any path", () => {
    expect(resolveMergePolicy([], "anything")).toBeUndefined();
  });

  test("declaration order matters when globs overlap", () => {
    const overlapping: ReadonlyArray<MergePolicyRule> = [
      { path_glob: "deliverables/**", resolution: "last-write-wins" },
      { path_glob: "deliverables/decision-log.md", resolution: "explicit-merge" },
    ];
    // First rule (broad) wins because it matches first.
    expect(resolveMergePolicy(overlapping, "deliverables/decision-log.md")).toBe(
      "last-write-wins",
    );
  });
});
