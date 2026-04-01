import type { SkillGraphNode } from "@/lib/openclaw/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SkillRegistryEntry {
  skill_id: string;
  name: string;
  description: string;
  tags: string[];
  skill_md: string;
}

export type SkillAvailabilityStatus =
  | "native"
  | "registry_match"
  | "needs_build"
  | "custom_built";

export interface SkillAvailability {
  skillId: string;
  status: SkillAvailabilityStatus;
  matchedSkillId?: string;
  reason: string;
}

export function normalizeSkillLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function findRegistryMatch(
  node: SkillGraphNode,
  registry: SkillRegistryEntry[],
): SkillRegistryEntry | null {
  const candidates = [
    normalizeSkillLookup(node.skill_id),
    normalizeSkillLookup(node.name),
  ].filter(Boolean);

  for (const entry of registry) {
    const entryIds = [
      normalizeSkillLookup(entry.skill_id),
      normalizeSkillLookup(entry.name),
    ];

    if (candidates.some((candidate) => entryIds.includes(candidate))) {
      return entry;
    }
  }

  return null;
}

export function resolveSkillAvailability(
  nodes: SkillGraphNode[],
  registry: SkillRegistryEntry[],
  builtSkillIds?: Iterable<string>,
): SkillAvailability[] {
  const builtIds = new Set(Array.from(builtSkillIds ?? [], (skillId) => normalizeSkillLookup(skillId)));

  return nodes.map((node) => {
    const normalizedSkillId = normalizeSkillLookup(node.skill_id);

    if (builtIds.has(normalizedSkillId)) {
      return {
        skillId: node.skill_id,
        status: "custom_built",
        reason: "A custom SKILL.md has been prepared for this capability.",
      };
    }

    if (node.source === "native_tool" || (node.native_tool ?? "").trim().length > 0) {
      return {
        skillId: node.skill_id,
        status: "native",
        reason: "This skill maps to a native agent capability and does not require a registry entry.",
      };
    }

    const match = findRegistryMatch(node, registry);
    if (match) {
      return {
        skillId: node.skill_id,
        status: "registry_match",
        matchedSkillId: match.skill_id,
        reason: `Matched registry skill ${match.name}.`,
      };
    }

    return {
      skillId: node.skill_id,
      status: "needs_build",
      reason: "No matching skill exists in the registry yet. Build this skill before deploy.",
    };
  });
}

export async function fetchSkillRegistry(): Promise<SkillRegistryEntry[]> {
  const res = await fetch(`${API_BASE}/api/skills`);
  if (!res.ok) {
    throw new Error(`Failed to load skill registry (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? (data as SkillRegistryEntry[]) : [];
}
