/**
 * build-compact-plan-prompt.ts
 *
 * The auto-fired Plan-stage user message. Compact by design — the
 * architect cats the full PRD/TRD from the workspace when it needs the
 * prose, so the prompt only carries the section outline + a short
 * preview of each section's content as a structural hint.
 *
 * Why compact: when this prompt embedded the FULL PRD + FULL TRD
 * (~30-50KB user message), the architect tended to delegate plan
 * generation to a Python helper script and emit closing markers via
 * shell print() — both because the JSON it had to produce was large
 * and because context-window pressure made inline emission feel
 * expensive. Both behaviors broke the marker pipeline. Shrinking the
 * prompt and pointing the architect at the workspace files restores
 * the inline-emission path.
 */

interface DocSection {
  heading: string;
  content?: string;
}

interface DiscoveryDoc {
  title: string;
  sections: DocSection[];
}

export interface CompactPlanInputDocs {
  prd: DiscoveryDoc;
  trd: DiscoveryDoc;
}

export const PER_SECTION_PREVIEW_CHARS = 200;

function outline(label: "PRD" | "TRD", doc: DiscoveryDoc): string {
  const header = `## ${label}: ${doc.title}`;
  const sectionLines = doc.sections.map((s) => {
    const content = (s.content ?? "").trim();
    const preview = content.length > PER_SECTION_PREVIEW_CHARS
      ? `${content.slice(0, PER_SECTION_PREVIEW_CHARS).trimEnd()}…`
      : content;
    return preview ? `- **${s.heading}** — ${preview}` : `- **${s.heading}**`;
  });
  return [header, ...sectionLines].join("\n");
}

export function buildCompactPlanPrompt(docs: CompactPlanInputDocs | null): string {
  if (!docs) {
    return "Generate the architecture plan for this agent.";
  }
  return [
    "The user has approved the PRD and TRD. Generate a structured architecture plan.",
    "",
    "Section outline below — full prose is in the sandbox at",
    "`~/.openclaw/workspace/.openclaw/discovery/PRD.md` and `TRD.md`. Read those files",
    "with `cat` if you need details beyond the previews here.",
    "",
    outline("PRD", docs.prd),
    "",
    outline("TRD", docs.trd),
  ].join("\n");
}
