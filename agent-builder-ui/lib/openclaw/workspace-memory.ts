export interface WorkspaceMemory {
  instructions: string;
  continuitySummary: string;
  pinnedPaths: string[];
  updatedAt: string | null;
}

export function normalizeWorkspaceMemory(value: unknown): WorkspaceMemory {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    instructions: typeof raw.instructions === "string" ? raw.instructions : "",
    continuitySummary: typeof raw.continuity_summary === "string"
      ? raw.continuity_summary
      : typeof raw.continuitySummary === "string"
      ? raw.continuitySummary
      : "",
    pinnedPaths: Array.isArray(raw.pinned_paths)
      ? raw.pinned_paths.filter((item): item is string => typeof item === "string")
      : Array.isArray(raw.pinnedPaths)
      ? raw.pinnedPaths.filter((item): item is string => typeof item === "string")
      : [],
    updatedAt: typeof raw.updated_at === "string"
      ? raw.updated_at
      : typeof raw.updatedAt === "string"
      ? raw.updatedAt
      : null,
  };
}

export function hasWorkspaceMemory(memory: WorkspaceMemory | null | undefined): boolean {
  if (!memory) return false;
  return Boolean(
    memory.instructions.trim() ||
    memory.continuitySummary.trim() ||
    memory.pinnedPaths.length > 0,
  );
}

export function buildWorkspaceMemorySystemMessage(memory: WorkspaceMemory): string {
  const sections: string[] = ["Workspace memory for this agent:"];

  if (memory.instructions.trim()) {
    sections.push(`Instructions:\n${memory.instructions.trim()}`);
  }

  if (memory.continuitySummary.trim()) {
    sections.push(`Continuity summary:\n${memory.continuitySummary.trim()}`);
  }

  if (memory.pinnedPaths.length > 0) {
    sections.push(`Pinned workspace references:\n- ${memory.pinnedPaths.join("\n- ")}`);
  }

  sections.push("Apply this context to the new conversation, but do not rewrite prior transcripts.");

  return sections.join("\n\n");
}
