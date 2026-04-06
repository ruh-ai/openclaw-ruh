export interface SkillRegistryEntry {
  skill_id: string;
  name: string;
  description: string;
  tags: string[];
  skill_md: string;
  /** "community" = published by a real agent build */
  source?: 'community';
  /** Agent ID that published this skill (community only) */
  publishedBy?: string;
  publishedAt?: string;
}

// ─── Skill Registry ─────────────────────────────────────────────────────────
// The registry is a search-only reference for the Architect. Skills here are
// NOT auto-assigned to new agents. The Architect can search/browse the registry
// for inspiration, but must always build each agent's skills from scratch.
// Skills enter the registry only when published by a real agent build.

// ─── Dynamic registry (community-published skills) ──────────────────────────

const communitySkills: SkillRegistryEntry[] = [];

function normalizeSkillId(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

export function listSkills(): SkillRegistryEntry[] {
  return [...communitySkills];
}

export function findSkill(skillId: string): SkillRegistryEntry | null {
  const normalized = normalizeSkillId(skillId);
  return listSkills().find((entry) => normalizeSkillId(entry.skill_id) === normalized) ?? null;
}

/** Search skills by keyword query across name, description, and tags. */
export function searchSkills(query: string): SkillRegistryEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return listSkills();

  return listSkills()
    .map((entry) => {
      const haystack = `${entry.skill_id} ${entry.name} ${entry.description} ${entry.tags.join(' ')}`.toLowerCase();
      const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

/** Publish a skill to the community registry. Returns true if added, false if already exists. */
export function publishSkill(entry: SkillRegistryEntry): boolean {
  const normalized = normalizeSkillId(entry.skill_id);
  const exists = listSkills().some((e) => normalizeSkillId(e.skill_id) === normalized);
  if (exists) return false;

  communitySkills.push({
    ...entry,
    source: 'community',
    publishedAt: new Date().toISOString(),
  });
  return true;
}

/** Get registry stats. */
export function registryStats() {
  return {
    community: communitySkills.length,
    total: communitySkills.length,
  };
}
