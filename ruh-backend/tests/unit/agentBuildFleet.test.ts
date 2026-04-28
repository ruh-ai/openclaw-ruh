/**
 * Path B Slice 3 — per-agent build decomposition tests.
 *
 * Covers:
 *   - getAgentTargets() returns null for single-agent, [main, ...subs] for fleet
 *   - expectedFilesForSpecialist() routes per-agent specialists under agents/<id>/
 *   - getSpecialistPrompt() emits agent-scoped paths + skill filtering when target is provided
 *   - Single-agent (no target) preserves root-level paths and full skill list (regression pin)
 *   - Pipeline-level specialists (database, backend, dashboard, verify) ignore target
 */

import { describe, expect, test } from "bun:test";
import { getAgentTargets, expectedFilesForSpecialist } from "../../src/agentBuild";
import type { ArchitecturePlan } from "../../src/scaffoldTemplates";
import {
  getSpecialistPrompt,
  buildIdentityPrompt,
  buildSkillHandlerPrompt,
  type TargetAgent,
} from "../../src/specialistPrompts";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function basePlan(over: Partial<ArchitecturePlan> = {}): ArchitecturePlan {
  return {
    skills: [
      { id: "general-help", name: "General Help", description: "", dependencies: [], envVars: [] },
      { id: "parse-rfp", name: "Parse RFP", description: "", dependencies: [], envVars: [] },
      { id: "compute-takeoff", name: "Compute Takeoff", description: "", dependencies: [], envVars: [] },
    ],
    workflow: { steps: [] },
    integrations: [],
    triggers: [],
    channels: [],
    envVars: [],
    subAgents: [],
    missionControl: null,
    ...over,
  };
}

function fleetPlan(): ArchitecturePlan {
  return basePlan({
    subAgents: [
      {
        id: "intake",
        name: "Intake",
        description: "Parse RFP into structured requirements",
        type: "specialist",
        skills: ["parse-rfp"],
        trigger: "intake",
        autonomy: "fully_autonomous",
      },
      {
        id: "takeoff",
        name: "Takeoff",
        description: "Compute material quantities",
        type: "specialist",
        skills: ["compute-takeoff"],
        trigger: "takeoff",
        autonomy: "requires_approval",
      },
    ],
  });
}

// ─── getAgentTargets ───────────────────────────────────────────────────────

describe("getAgentTargets", () => {
  test("returns null for single-agent (empty subAgents)", () => {
    const result = getAgentTargets(basePlan(), "Test Agent");
    expect(result).toBeNull();
  });

  test("returns main + each sub-agent for fleet, in declaration order", () => {
    const result = getAgentTargets(fleetPlan(), "ECC Estimator");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result![0]?.id).toBe("main");
    expect(result![0]?.role).toBe("Pipeline orchestrator");
    expect(result![0]?.isOrchestrator).toBe(true);
    expect(result![1]?.id).toBe("intake");
    expect(result![1]?.isOrchestrator).toBe(false);
    expect(result![2]?.id).toBe("takeoff");
  });

  test("main agent owns skills NOT claimed by any sub-agent", () => {
    const result = getAgentTargets(fleetPlan(), "ECC Estimator");
    // basePlan has 3 skills; intake claims parse-rfp; takeoff claims compute-takeoff
    // → main owns the remaining `general-help`
    expect(result![0]?.skills).toEqual(["general-help"]);
  });

  test("sub-agent skills are mirrored verbatim from architect emission", () => {
    const result = getAgentTargets(fleetPlan(), "ECC Estimator");
    expect(result![1]?.skills).toEqual(["parse-rfp"]);
    expect(result![2]?.skills).toEqual(["compute-takeoff"]);
  });

  test("sub-agent role falls back from description → name", () => {
    const plan = basePlan({
      subAgents: [
        {
          id: "no-desc",
          name: "Specialist X",
          description: "", // empty — should fall back to name
          type: "specialist",
          skills: [],
          trigger: "",
          autonomy: "requires_approval",
        },
      ],
    });
    const result = getAgentTargets(plan, "Test");
    expect(result![1]?.role).toBe("Specialist X");
  });
});

// ─── expectedFilesForSpecialist ────────────────────────────────────────────

describe("expectedFilesForSpecialist — root paths preserved when no target (single-agent)", () => {
  test("identity → SOUL/AGENTS/IDENTITY at root", () => {
    expect(expectedFilesForSpecialist("identity", basePlan())).toEqual([
      "SOUL.md",
      "AGENTS.md",
      "IDENTITY.md",
    ]);
  });

  test("skills → all plan.skills under skills/<id>/SKILL.md", () => {
    expect(expectedFilesForSpecialist("skills", basePlan())).toEqual([
      "skills/general-help/SKILL.md",
      "skills/parse-rfp/SKILL.md",
      "skills/compute-takeoff/SKILL.md",
    ]);
  });
});

describe("expectedFilesForSpecialist — per-agent paths when target supplied (fleet)", () => {
  const intakeTarget: TargetAgent = {
    id: "intake",
    name: "Intake",
    role: "Parse RFP",
    skills: ["parse-rfp"],
    isOrchestrator: false,
  };

  test("identity targets agents/<id>/SOUL.md (et al.)", () => {
    expect(expectedFilesForSpecialist("identity", basePlan(), intakeTarget)).toEqual([
      "agents/intake/SOUL.md",
      "agents/intake/AGENTS.md",
      "agents/intake/IDENTITY.md",
    ]);
  });

  test("skills filters to target.skills AND uses agents/<id>/skills/ prefix", () => {
    // Intake owns only parse-rfp — the other skills belong to other agents
    expect(expectedFilesForSpecialist("skills", basePlan(), intakeTarget)).toEqual([
      "agents/intake/skills/parse-rfp/SKILL.md",
    ]);
  });

  test("main orchestrator gets the unclaimed-skills set", () => {
    const mainTarget: TargetAgent = {
      id: "main",
      name: "ECC Estimator",
      role: "Pipeline orchestrator",
      skills: ["general-help"],
      isOrchestrator: true,
    };
    expect(expectedFilesForSpecialist("skills", basePlan(), mainTarget)).toEqual([
      "agents/main/skills/general-help/SKILL.md",
    ]);
  });
});

describe("expectedFilesForSpecialist — pipeline-level specialists ignore target", () => {
  const target: TargetAgent = {
    id: "intake",
    name: "Intake",
    role: "Parse RFP",
    skills: [],
    isOrchestrator: false,
  };

  test("database — no agents/<id>/ prefix even with target", () => {
    const plan = basePlan({
      dataSchema: { tables: [{ name: "estimates", columns: [{ name: "id" }] }] },
    });
    const withTarget = expectedFilesForSpecialist("database", plan, target);
    const withoutTarget = expectedFilesForSpecialist("database", plan);
    expect(withTarget).toEqual(withoutTarget);
    expect(withTarget[0]?.startsWith("agents/")).toBe(false);
  });

  test("backend — no agents/<id>/ prefix even with target", () => {
    const plan = basePlan({
      apiEndpoints: [{ method: "GET", path: "/estimates", description: "" }],
    });
    const withTarget = expectedFilesForSpecialist("backend", plan, target);
    const withoutTarget = expectedFilesForSpecialist("backend", plan);
    expect(withTarget).toEqual(withoutTarget);
  });
});

// ─── getSpecialistPrompt + prompt builders ─────────────────────────────────

describe("getSpecialistPrompt — single-agent (no target) preserves existing prompt shape", () => {
  test("identity prompt mentions root SOUL.md (no agents/ prefix)", () => {
    const prompt = getSpecialistPrompt("identity", basePlan(), "Test Agent");
    expect(prompt).toContain("SOUL.md");
    expect(prompt).toContain("AGENTS.md");
    // No per-agent path injection for single-agent — verify the root form
    // appears in the ENDSOUL example (vs. agents/main/SOUL.md):
    expect(prompt).toContain("~/.openclaw/workspace/SOUL.md");
    expect(prompt).not.toContain("agents/");
  });

  test("skills prompt covers ALL plan skills when no target", () => {
    const prompt = getSpecialistPrompt("skills", basePlan(), "Test Agent");
    expect(prompt).toContain("general-help");
    expect(prompt).toContain("parse-rfp");
    expect(prompt).toContain("compute-takeoff");
    expect(prompt).toContain("~/.openclaw/workspace/skills/");
    expect(prompt).not.toContain("agents/");
  });
});

describe("getSpecialistPrompt — fleet (target supplied) emits per-agent prompts", () => {
  const intakeTarget: TargetAgent = {
    id: "intake",
    name: "Intake",
    role: "Parse RFP",
    skills: ["parse-rfp"],
    isOrchestrator: false,
  };

  test("identity prompt instructs writing to agents/<id>/", () => {
    const prompt = getSpecialistPrompt("identity", basePlan(), "Test Agent", intakeTarget);
    expect(prompt).toContain("agents/intake/SOUL.md");
    expect(prompt).toContain("agents/intake/AGENTS.md");
    expect(prompt).toContain("agents/intake/IDENTITY.md");
    // Fleet context block makes the agent's role explicit
    expect(prompt).toContain("multi-agent fleet");
    expect(prompt).toContain("Agent id: intake");
  });

  test("identity prompt distinguishes orchestrator from specialist", () => {
    const orchestratorTarget: TargetAgent = {
      ...intakeTarget,
      id: "main",
      role: "Pipeline orchestrator",
      isOrchestrator: true,
    };
    const orchestratorPrompt = getSpecialistPrompt(
      "identity",
      basePlan(),
      "Test Agent",
      orchestratorTarget,
    );
    expect(orchestratorPrompt).toContain("PIPELINE ORCHESTRATOR");
    expect(orchestratorPrompt).not.toContain("This is a SPECIALIST");

    const specialistPrompt = getSpecialistPrompt("identity", basePlan(), "Test Agent", intakeTarget);
    expect(specialistPrompt).toContain("SPECIALIST");
    expect(specialistPrompt).not.toContain("PIPELINE ORCHESTRATOR");
  });

  test("skills prompt filters to target's owned skills only", () => {
    const prompt = getSpecialistPrompt("skills", basePlan(), "Test Agent", intakeTarget);
    expect(prompt).toContain("parse-rfp");
    // Other agents' skills must NOT leak into this prompt
    expect(prompt).not.toContain("compute-takeoff");
    expect(prompt).not.toContain("general-help");
  });

  test("skills prompt instructs writing under agents/<id>/skills/", () => {
    const prompt = getSpecialistPrompt("skills", basePlan(), "Test Agent", intakeTarget);
    expect(prompt).toContain("agents/intake/skills/");
  });

  test("skills prompt with target owning no skills says '(none)'", () => {
    const noSkillsTarget: TargetAgent = {
      ...intakeTarget,
      skills: [],
    };
    const prompt = getSpecialistPrompt("skills", basePlan(), "Test Agent", noSkillsTarget);
    expect(prompt).toContain("none");
  });
});

describe("getSpecialistPrompt — pipeline-level specialists never receive target context", () => {
  const target: TargetAgent = {
    id: "intake",
    name: "Intake",
    role: "Parse RFP",
    skills: [],
    isOrchestrator: false,
  };

  test("database prompt is identical with/without target", () => {
    const plan = basePlan({
      dataSchema: { tables: [{ name: "estimates", columns: [{ name: "id" }] }] },
    });
    const a = getSpecialistPrompt("database", plan, "Test Agent", target);
    const b = getSpecialistPrompt("database", plan, "Test Agent");
    expect(a).toBe(b);
  });

  test("backend prompt is identical with/without target", () => {
    const plan = basePlan({
      apiEndpoints: [{ method: "GET", path: "/estimates", description: "" }],
    });
    const a = getSpecialistPrompt("backend", plan, "Test Agent", target);
    const b = getSpecialistPrompt("backend", plan, "Test Agent");
    expect(a).toBe(b);
  });
});

// ─── Direct prompt-builder smoke tests (catch regressions early) ───────────

describe("buildIdentityPrompt + buildSkillHandlerPrompt — direct smoke", () => {
  test("buildIdentityPrompt without target yields root paths", () => {
    const prompt = buildIdentityPrompt(basePlan(), "Test Agent");
    expect(prompt).toContain("SOUL.md");
    expect(prompt).not.toContain("agents/");
  });

  test("buildSkillHandlerPrompt without target yields root paths + all skills", () => {
    const prompt = buildSkillHandlerPrompt(basePlan());
    expect(prompt).toContain("skills/");
    expect(prompt).not.toContain("agents/");
    expect(prompt).toContain("general-help");
    expect(prompt).toContain("parse-rfp");
    expect(prompt).toContain("compute-takeoff");
  });
});
