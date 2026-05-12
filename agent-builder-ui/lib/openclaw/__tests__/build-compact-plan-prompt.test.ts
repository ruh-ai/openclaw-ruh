import { describe, expect, test } from "bun:test";
import {
  buildCompactPlanPrompt,
  PER_SECTION_PREVIEW_CHARS,
  type CompactPlanInputDocs,
} from "../build-compact-plan-prompt";

const SAMPLE_DOCS: CompactPlanInputDocs = {
  prd: {
    title: "Product Requirements Document",
    sections: [
      {
        heading: "Problem Statement",
        content:
          "Users miss tasks from chat. This agent captures explicit task language and routes it to an approval queue. It must never silently mutate state — every change is approval-gated.",
      },
      { heading: "Target Users", content: "Single-operator personal productivity case." },
      { heading: "Empty section", content: "" },
    ],
  },
  trd: {
    title: "Technical Requirements Document",
    sections: [
      {
        heading: "Architecture Overview",
        content:
          "PostgreSQL-backed local-first store with a daily review pipeline and a Mission Control dashboard. Capture detection runs on every inbound message.",
      },
      {
        heading: "API Surface",
        content:
          "REST endpoints over JSON. GET /api/test-agent/overview, POST /api/test-agent/approvals/:id/resolve, etc.",
      },
    ],
  },
};

describe("buildCompactPlanPrompt", () => {
  test("returns a generic instruction when docs are null", () => {
    expect(buildCompactPlanPrompt(null)).toBe(
      "Generate the architecture plan for this agent.",
    );
  });

  test("includes the standard plan-generation instruction and workspace cat hint", () => {
    const prompt = buildCompactPlanPrompt(SAMPLE_DOCS);
    expect(prompt).toContain("approved the PRD and TRD");
    expect(prompt).toContain(".openclaw/workspace/.openclaw/discovery/PRD.md");
    expect(prompt).toContain("TRD.md");
    expect(prompt).toContain("`cat`");
  });

  test("renders PRD outline with title + section headings + content previews", () => {
    const prompt = buildCompactPlanPrompt(SAMPLE_DOCS);
    expect(prompt).toContain("## PRD: Product Requirements Document");
    expect(prompt).toContain("- **Problem Statement**");
    expect(prompt).toContain("- **Target Users**");
    expect(prompt).toContain("Single-operator personal productivity case.");
  });

  test("renders TRD outline with title + section headings", () => {
    const prompt = buildCompactPlanPrompt(SAMPLE_DOCS);
    expect(prompt).toContain("## TRD: Technical Requirements Document");
    expect(prompt).toContain("- **Architecture Overview**");
    expect(prompt).toContain("- **API Surface**");
  });

  test("truncates long section content to PER_SECTION_PREVIEW_CHARS with ellipsis", () => {
    const longContent = "x".repeat(2000);
    const prompt = buildCompactPlanPrompt({
      prd: { title: "P", sections: [{ heading: "Long", content: longContent }] },
      trd: { title: "T", sections: [] },
    });
    // The full 2000 'x's must not appear
    expect(prompt).not.toContain("x".repeat(PER_SECTION_PREVIEW_CHARS + 1));
    // The truncation marker is present
    expect(prompt).toContain("…");
  });

  test("renders empty-content sections as bare heading without dash separator", () => {
    const prompt = buildCompactPlanPrompt(SAMPLE_DOCS);
    // "Empty section" has no content — should appear without the "— " infix
    expect(prompt).toContain("- **Empty section**\n");
    expect(prompt).not.toContain("- **Empty section** — ");
  });

  test("compact prompt is dramatically smaller than the previous full-embed shape", () => {
    // Build a large doc set similar to a real Test Agent PRD/TRD
    const largeContent = "Detail paragraph. ".repeat(500); // ~9KB per section
    const heavyDocs: CompactPlanInputDocs = {
      prd: {
        title: "PRD",
        sections: Array.from({ length: 10 }, (_, i) => ({
          heading: `Section ${i}`,
          content: largeContent,
        })),
      },
      trd: {
        title: "TRD",
        sections: Array.from({ length: 12 }, (_, i) => ({
          heading: `Section ${i}`,
          content: largeContent,
        })),
      },
    };

    const fullEmbedSize =
      heavyDocs.prd.sections.reduce((n, s) => n + (s.content?.length ?? 0), 0)
      + heavyDocs.trd.sections.reduce((n, s) => n + (s.content?.length ?? 0), 0);
    const compactPrompt = buildCompactPlanPrompt(heavyDocs);

    // Compact prompt should be much smaller than full embed
    expect(compactPrompt.length).toBeLessThan(fullEmbedSize / 10);
    // And below the practical "the model panics and delegates to scripts" threshold
    expect(compactPrompt.length).toBeLessThan(10_000);
  });
});
