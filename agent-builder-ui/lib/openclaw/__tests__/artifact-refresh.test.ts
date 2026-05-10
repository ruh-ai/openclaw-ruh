/**
 * artifact-refresh.test.ts — Unit tests for parseDiscoveryMarkdown.
 *
 * The refetchArtifactFromWorkspace dispatcher is integration-tested via
 * the TabChat post-revision useEffect; here we just verify the markdown
 * parser is wire-compatible with the existing recoverThinkDocuments
 * shape (matters because the store consumer expects {title, sections[]}
 * with specific section heading rules).
 */
import { describe, expect, test } from "bun:test";
import { parseDiscoveryMarkdown } from "../artifact-refresh";

describe("parseDiscoveryMarkdown", () => {
  test("returns null for empty input", () => {
    expect(parseDiscoveryMarkdown("")).toBeNull();
    expect(parseDiscoveryMarkdown("   \n  \n")).toBeNull();
  });

  test("extracts title from H1 and headings from H2s", () => {
    const md = [
      "# Product Requirements Document",
      "",
      "## Problem Statement",
      "Users miss tasks.",
      "",
      "## Target Users",
      "Knowledge workers.",
    ].join("\n");

    const doc = parseDiscoveryMarkdown(md);
    expect(doc?.title).toBe("Product Requirements Document");
    expect(doc?.sections.length).toBe(2);
    expect(doc?.sections[0]).toEqual({
      heading: "Problem Statement",
      content: "Users miss tasks.",
    });
    expect(doc?.sections[1]).toEqual({
      heading: "Target Users",
      content: "Knowledge workers.",
    });
  });

  test("falls back to 'Document' title when there is no H1", () => {
    const md = "## Section A\nbody";
    const doc = parseDiscoveryMarkdown(md);
    expect(doc?.title).toBe("Document");
    expect(doc?.sections[0]?.heading).toBe("Section A");
  });

  test("returns null when there are no H2 sections (matches existing parse contract)", () => {
    // recoverThinkDocuments treats a doc without H2 sections as not-ready.
    // Preserve that behavior so we don't paint an empty PRD as 'ready'.
    expect(parseDiscoveryMarkdown("# Title only\nno headings")).toBeNull();
  });

  test("preserves multi-line section content verbatim", () => {
    const md = [
      "# PRD",
      "## Capabilities",
      "1. capture",
      "   - inline detail",
      "2. classify",
      "",
      "Notes after a blank line.",
    ].join("\n");

    const doc = parseDiscoveryMarkdown(md);
    expect(doc?.sections[0]?.content).toContain("inline detail");
    expect(doc?.sections[0]?.content).toContain("Notes after a blank line.");
  });

  test("survives Windows line endings", () => {
    const md = "# Doc\r\n## Section\r\ncontent\r\n";
    const doc = parseDiscoveryMarkdown(md);
    expect(doc?.title).toBe("Doc");
    // Windows CR remains in the trailing content of the heading capture
    // (existing recoverThinkDocuments has the same behavior).
    expect(doc?.sections[0]?.heading.trim()).toBe("Section");
  });
});
