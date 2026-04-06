/**
 * Parallel build utilities for splitting skill generation across concurrent workers.
 *
 * Ships as pure functions now — actual parallel execution is deferred to a follow-up PR.
 * The grouping and merge logic can be unit tested independently.
 */

import type { ArchitecturePlanSkill } from "@/lib/openclaw/types";
import type { GeneratedSkills } from "./generate-skills";

/**
 * Partition planned skills into groups for parallel build.
 *
 * Groups respect dependency order: skills with no dependencies are in earlier groups.
 * Within each dependency layer, skills are chunked into groups of `maxGroupSize`.
 */
export function partitionSkillsForParallelBuild(
  skills: ArchitecturePlanSkill[],
  maxGroupSize = 4,
): ArchitecturePlanSkill[][] {
  if (skills.length <= maxGroupSize) return [skills];

  // Build dependency graph
  const skillIds = new Set(skills.map((s) => s.id));
  const dependsOn = new Map<string, Set<string>>();
  for (const skill of skills) {
    const deps = new Set(
      (skill.dependencies ?? []).filter((d) => skillIds.has(d)),
    );
    dependsOn.set(skill.id, deps);
  }

  // Topological sort into layers
  const layers: ArchitecturePlanSkill[][] = [];
  const placed = new Set<string>();

  while (placed.size < skills.length) {
    const layer: ArchitecturePlanSkill[] = [];
    for (const skill of skills) {
      if (placed.has(skill.id)) continue;
      const deps = dependsOn.get(skill.id) ?? new Set();
      const allDepsPlaced = [...deps].every((d) => placed.has(d));
      if (allDepsPlaced) {
        layer.push(skill);
      }
    }

    // Prevent infinite loop if there are circular dependencies
    if (layer.length === 0) {
      const remaining = skills.filter((s) => !placed.has(s.id));
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    for (const skill of layer) {
      placed.add(skill.id);
    }
  }

  // Chunk each layer into groups of maxGroupSize
  const groups: ArchitecturePlanSkill[][] = [];
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += maxGroupSize) {
      groups.push(layer.slice(i, i + maxGroupSize));
    }
  }

  return groups;
}

/**
 * Merge results from parallel build groups into a single GeneratedSkills.
 *
 * Combines nodes, deduplicates agent rules, and builds a unified workflow.
 */
export function mergeParallelBuildResults(
  groups: GeneratedSkills[],
): GeneratedSkills {
  const allNodes = groups.flatMap((g) => g.nodes);
  const allRules = [...new Set(groups.flatMap((g) => g.agentRules))];
  const systemName = groups.find((g) => g.systemName)?.systemName ?? null;

  // Build unified workflow from per-group workflows
  const allSteps = groups.flatMap((g) => g.workflow?.steps ?? []);
  const workflow = allSteps.length > 0
    ? {
        name: "main-workflow",
        description: `${systemName || "agent"} workflow`,
        steps: allSteps,
      }
    : null;

  return {
    nodes: allNodes,
    workflow,
    systemName,
    agentRules: allRules,
  };
}
