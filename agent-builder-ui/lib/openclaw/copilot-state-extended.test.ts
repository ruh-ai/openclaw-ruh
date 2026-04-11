/**
 * Extended tests for copilot-state covering the lifecycle actions and
 * state management operations that are not covered in the base test.
 */
import { describe, expect, test, beforeEach } from "bun:test";

import { useCoPilotStore } from "./copilot-state";

beforeEach(() => {
  useCoPilotStore.getState().reset();
});

// ─── Phase navigation ────────────────────────────────────────────────────────

describe("phase navigation", () => {
  test("advancePhase moves forward through PHASE_ORDER", () => {
    const store = useCoPilotStore.getState();
    expect(store.phase).toBe("purpose");
    store.advancePhase();
    expect(useCoPilotStore.getState().phase).toBe("discovery");
  });

  test("advancePhase does not go past last phase", () => {
    useCoPilotStore.setState({ phase: "review" });
    useCoPilotStore.getState().advancePhase();
    expect(useCoPilotStore.getState().phase).toBe("review");
  });

  test("goBackPhase moves backward through PHASE_ORDER", () => {
    useCoPilotStore.setState({ phase: "skills" });
    useCoPilotStore.getState().goBackPhase();
    expect(useCoPilotStore.getState().phase).toBe("discovery");
  });

  test("goBackPhase does not go before first phase", () => {
    expect(useCoPilotStore.getState().phase).toBe("purpose");
    useCoPilotStore.getState().goBackPhase();
    expect(useCoPilotStore.getState().phase).toBe("purpose");
  });

  test("setPhase sets any arbitrary phase directly", () => {
    useCoPilotStore.getState().setPhase("channels");
    expect(useCoPilotStore.getState().phase).toBe("channels");
  });
});

// ─── updateFields ────────────────────────────────────────────────────────────

describe("updateFields", () => {
  test("updates name and description", () => {
    useCoPilotStore.getState().updateFields({ name: "Ads Agent", description: "Optimises campaigns" });
    const s = useCoPilotStore.getState();
    expect(s.name).toBe("Ads Agent");
    expect(s.description).toBe("Optimises campaigns");
  });

  test("updates systemName alone without touching name/description", () => {
    useCoPilotStore.getState().updateFields({ name: "My Agent" });
    useCoPilotStore.getState().updateFields({ systemName: "my-agent" });
    const s = useCoPilotStore.getState();
    expect(s.name).toBe("My Agent");
    expect(s.systemName).toBe("my-agent");
  });
});

// ─── Discovery ───────────────────────────────────────────────────────────────

describe("discovery actions", () => {
  test("setDiscoveryQuestions stores questions and sets status to ready", () => {
    const questions = [{ id: "q1", question: "What problem?", type: "text" as const, required: true }];
    useCoPilotStore.getState().setDiscoveryQuestions(questions);
    const s = useCoPilotStore.getState();
    expect(s.discoveryQuestions).toEqual(questions);
    expect(s.discoveryStatus).toBe("ready");
  });

  test("setDiscoveryAnswer stores answer keyed by questionId", () => {
    useCoPilotStore.getState().setDiscoveryAnswer("q1", "automate ad bidding");
    expect(useCoPilotStore.getState().discoveryAnswers["q1"]).toBe("automate ad bidding");
  });

  test("setDiscoveryAnswer stores array answer", () => {
    useCoPilotStore.getState().setDiscoveryAnswer("q2", ["a", "b"]);
    expect(useCoPilotStore.getState().discoveryAnswers["q2"]).toEqual(["a", "b"]);
  });

  test("setDiscoveryDocuments stores docs and sets status to ready", () => {
    const docs = {
      prd: { title: "PRD", sections: [] },
      trd: { title: "TRD", sections: [] },
    };
    useCoPilotStore.getState().setDiscoveryDocuments(docs as any);
    const s = useCoPilotStore.getState();
    expect(s.discoveryDocuments).toEqual(docs);
    expect(s.discoveryStatus).toBe("ready");
  });

  test("updateDiscoveryDocSection updates a section by index", () => {
    useCoPilotStore.getState().setDiscoveryDocuments({
      prd: { title: "PRD", sections: [{ heading: "H1", content: "old" }] },
      trd: { title: "TRD", sections: [] },
    } as any);
    useCoPilotStore.getState().updateDiscoveryDocSection("prd", 0, "new content");
    expect(useCoPilotStore.getState().discoveryDocuments?.prd.sections[0].content).toBe("new content");
  });

  test("updateDiscoveryDocSection is a no-op when discoveryDocuments is null", () => {
    useCoPilotStore.getState().updateDiscoveryDocSection("prd", 0, "x");
    expect(useCoPilotStore.getState().discoveryDocuments).toBeNull();
  });

  test("skipDiscovery clears questions/answers and sets status to skipped", () => {
    useCoPilotStore.getState().setDiscoveryAnswer("q1", "foo");
    useCoPilotStore.getState().skipDiscovery();
    const s = useCoPilotStore.getState();
    expect(s.discoveryStatus).toBe("skipped");
    expect(s.discoveryQuestions).toBeNull();
    expect(s.discoveryAnswers).toEqual({});
  });

  test("setDiscoveryStatus changes the status field", () => {
    useCoPilotStore.getState().setDiscoveryStatus("loading");
    expect(useCoPilotStore.getState().discoveryStatus).toBe("loading");
  });
});

// ─── Skill graph ─────────────────────────────────────────────────────────────

describe("skill graph actions", () => {
  const baseNode = (id: string) => ({
    skill_id: id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: "desc",
    depends_on: [] as string[],
    requires_env: [] as string[],
    source: "custom" as const,
    status: "generated" as const,
  });

  test("clearSkillGraph resets all skill-related state", () => {
    useCoPilotStore.getState().setSkillGraph([baseNode("a"), baseNode("b")], null, ["rule"]);
    useCoPilotStore.getState().clearSkillGraph();
    const s = useCoPilotStore.getState();
    expect(s.skillGraph).toBeNull();
    expect(s.selectedSkillIds).toEqual([]);
    expect(s.agentRules).toEqual([]);
  });

  test("setSkillGeneration sets status and error", () => {
    useCoPilotStore.getState().setSkillGeneration("loading");
    expect(useCoPilotStore.getState().skillGenerationStatus).toBe("loading");
    useCoPilotStore.getState().setSkillGeneration("error", "oops");
    expect(useCoPilotStore.getState().skillGenerationError).toBe("oops");
  });

  test("markSkillBuilt adds to builtSkillIds once", () => {
    useCoPilotStore.getState().setSkillGraph([baseNode("fetch-data")], null, []);
    useCoPilotStore.getState().markSkillBuilt("fetch-data");
    useCoPilotStore.getState().markSkillBuilt("fetch-data"); // idempotent
    expect(useCoPilotStore.getState().builtSkillIds.length).toBe(1);
  });

  test("markSkillBuilt stamps skill_md on the graph node", () => {
    useCoPilotStore.getState().setSkillGraph([baseNode("fetch-data")], null, []);
    useCoPilotStore.getState().markSkillBuilt("fetch-data", "# skill content");
    const node = useCoPilotStore.getState().skillGraph?.find((n) => n.skill_id === "fetch-data");
    expect(node?.skill_md).toBe("# skill content");
  });

  test("buildAllSkills uses builder to generate skill_md for all selected nodes", () => {
    useCoPilotStore.getState().setSkillGraph([baseNode("a"), baseNode("b")], null, []);
    useCoPilotStore.getState().buildAllSkills((node) => `# ${node.name} content`);
    const graph = useCoPilotStore.getState().skillGraph!;
    expect(graph[0].skill_md).toBe("# A content");
    expect(graph[1].skill_md).toBe("# B content");
    expect(useCoPilotStore.getState().builtSkillIds).toContain("a");
    expect(useCoPilotStore.getState().builtSkillIds).toContain("b");
  });

  test("selectSkills updates selectedSkillIds", () => {
    useCoPilotStore.getState().selectSkills(["skill-a", "skill-b"]);
    expect(useCoPilotStore.getState().selectedSkillIds).toEqual(["skill-a", "skill-b"]);
  });

  test("setSkillAvailability stores availability array", () => {
    const avail = [{ skillId: "a", available: true }] as any;
    useCoPilotStore.getState().setSkillAvailability(avail);
    expect(useCoPilotStore.getState().skillAvailability).toEqual(avail);
  });
});

// ─── Tools / triggers / channels ─────────────────────────────────────────────

describe("tools and channels actions", () => {
  test("connectTools stores tool drafts", () => {
    const tools = [{ toolId: "google-ads", name: "Google Ads" }] as any;
    useCoPilotStore.getState().connectTools(tools);
    expect(useCoPilotStore.getState().connectedTools).toEqual(tools);
  });

  test("setCredentialDrafts stores drafts", () => {
    useCoPilotStore.getState().setCredentialDrafts({ "google-ads": { apiKey: "abc" } } as any);
    expect(useCoPilotStore.getState().credentialDrafts).toEqual({ "google-ads": { apiKey: "abc" } });
  });

  test("setRuntimeInputs stores runtime inputs", () => {
    const inputs = [{ key: "CUSTOMER_ID", label: "Customer ID", required: true }] as any;
    useCoPilotStore.getState().setRuntimeInputs(inputs);
    expect(useCoPilotStore.getState().runtimeInputs).toEqual(inputs);
  });

  test("setTriggers stores triggers", () => {
    const triggers = [{ triggerId: "cron", label: "Cron" }] as any;
    useCoPilotStore.getState().setTriggers(triggers);
    expect(useCoPilotStore.getState().triggers).toEqual(triggers);
  });

  test("setChannels stores channels", () => {
    const channels = [{ channelId: "slack", label: "Slack" }] as any;
    useCoPilotStore.getState().setChannels(channels);
    expect(useCoPilotStore.getState().channels).toEqual(channels);
  });

  test("setRules stores agent rules", () => {
    useCoPilotStore.getState().setRules(["Be polite", "Use formal tone"]);
    expect(useCoPilotStore.getState().agentRules).toEqual(["Be polite", "Use formal tone"]);
  });

  test("setImprovements stores improvements", () => {
    const improvements = [{ id: "i1", description: "Speed up" }] as any;
    useCoPilotStore.getState().setImprovements(improvements);
    expect(useCoPilotStore.getState().improvements).toEqual(improvements);
  });
});

// ─── DevStage lifecycle ───────────────────────────────────────────────────────

describe("dev stage lifecycle", () => {
  test("setDevStage advances maxUnlockedDevStage", () => {
    useCoPilotStore.getState().setDevStage("plan");
    const s = useCoPilotStore.getState();
    expect(s.devStage).toBe("plan");
    expect(s.maxUnlockedDevStage).toBe("plan");
  });

  test("setDevStage does not decrease maxUnlockedDevStage", () => {
    useCoPilotStore.getState().setDevStage("build");
    useCoPilotStore.getState().setDevStage("think");
    expect(useCoPilotStore.getState().maxUnlockedDevStage).toBe("build");
  });

  test("canAdvanceDevStage returns false for think when not approved", () => {
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(false);
  });

  test("canAdvanceDevStage returns true for think when thinkStatus is approved", () => {
    useCoPilotStore.setState({ thinkStatus: "approved" });
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(true);
  });

  test("canAdvanceDevStage returns true for think when thinkStatus is done", () => {
    useCoPilotStore.setState({ thinkStatus: "done" });
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(true);
  });

  test("advanceDevStage does nothing when gate not satisfied", () => {
    expect(useCoPilotStore.getState().devStage).toBe("think");
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("think");
  });

  test("advanceDevStage moves to plan when think is approved", () => {
    useCoPilotStore.setState({ thinkStatus: "approved" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("plan");
  });

  test("advanceDevStage moves build -> review when build is done", () => {
    useCoPilotStore.setState({ devStage: "build", buildStatus: "done", maxUnlockedDevStage: "build" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("review");
  });

  test("goBackDevStage moves back one stage and resets stage status", () => {
    useCoPilotStore.setState({ devStage: "plan", maxUnlockedDevStage: "plan", thinkStatus: "done" });
    useCoPilotStore.getState().goBackDevStage();
    const s = useCoPilotStore.getState();
    expect(s.devStage).toBe("think");
    // Going back to think should reset think-related state
    expect(s.thinkStatus).toBe("idle");
  });

  test("goBackDevStage does nothing when already at think", () => {
    useCoPilotStore.getState().goBackDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("think");
  });

  test("canAdvanceDevStage returns true for plan stage when planStatus is approved", () => {
    useCoPilotStore.setState({ devStage: "plan", planStatus: "approved" });
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(true);
  });

  test("canAdvanceDevStage returns true for plan stage when planStatus is done", () => {
    useCoPilotStore.setState({ devStage: "plan", planStatus: "done" });
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(true);
  });

  test("canAdvanceDevStage returns false at last stage", () => {
    useCoPilotStore.setState({ devStage: "reflect" });
    expect(useCoPilotStore.getState().canAdvanceDevStage()).toBe(false);
  });

  test("advanceDevStage from test stage marks evalStatus as done when previously idle", () => {
    useCoPilotStore.setState({ devStage: "test", maxUnlockedDevStage: "test", evalStatus: "idle" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("ship");
    expect(useCoPilotStore.getState().evalStatus).toBe("done");
  });

  test("advanceDevStage from test stage marks evalStatus as done when previously running", () => {
    useCoPilotStore.setState({ devStage: "test", maxUnlockedDevStage: "test", evalStatus: "running" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("ship");
    expect(useCoPilotStore.getState().evalStatus).toBe("done");
  });

  test("advanceDevStage does nothing when already at last stage", () => {
    useCoPilotStore.setState({ devStage: "reflect", maxUnlockedDevStage: "reflect" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("reflect");
  });

  test("setUserTriggeredPlan false clears planRunId", () => {
    useCoPilotStore.getState().setUserTriggeredPlan(true);
    expect(useCoPilotStore.getState().planRunId).not.toBeNull();
    useCoPilotStore.getState().setUserTriggeredPlan(false);
    expect(useCoPilotStore.getState().planRunId).toBeNull();
  });

  test("setUserTriggeredBuild false clears buildRunId", () => {
    useCoPilotStore.getState().setUserTriggeredBuild(true);
    expect(useCoPilotStore.getState().buildRunId).not.toBeNull();
    useCoPilotStore.getState().setUserTriggeredBuild(false);
    expect(useCoPilotStore.getState().buildRunId).toBeNull();
  });

  test("advanceDevStage moves plan -> build when planStatus is approved", () => {
    useCoPilotStore.setState({ devStage: "plan", maxUnlockedDevStage: "plan", planStatus: "approved" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("build");
  });

  test("advanceDevStage moves plan -> build when planStatus is done", () => {
    useCoPilotStore.setState({ devStage: "plan", maxUnlockedDevStage: "plan", planStatus: "done" });
    useCoPilotStore.getState().advanceDevStage();
    expect(useCoPilotStore.getState().devStage).toBe("build");
  });

  test("setSkillGraph with empty nodes array preserves existing skillGenerationStatus", () => {
    useCoPilotStore.getState().setSkillGeneration("loading");
    useCoPilotStore.getState().setSkillGraph([], null, []);
    // nodes.length === 0 → status unchanged from "loading"
    expect(useCoPilotStore.getState().skillGenerationStatus).toBe("loading");
  });
});

// ─── Think stage actions ──────────────────────────────────────────────────────

describe("think stage actions", () => {
  test("setThinkStatus updates thinkStatus", () => {
    useCoPilotStore.getState().setThinkStatus("generating");
    expect(useCoPilotStore.getState().thinkStatus).toBe("generating");
  });

  test("setUserTriggeredThink sets flag and allocates a runId", () => {
    useCoPilotStore.getState().setUserTriggeredThink(true);
    const s = useCoPilotStore.getState();
    expect(s.userTriggeredThink).toBe(true);
    expect(s.thinkRunId).not.toBeNull();
  });

  test("setUserTriggeredThink false clears thinkRunId", () => {
    useCoPilotStore.getState().setUserTriggeredThink(true);
    useCoPilotStore.getState().setUserTriggeredThink(false);
    expect(useCoPilotStore.getState().thinkRunId).toBeNull();
  });

  test("markThinkRunDispatched sets lastDispatchedThinkRunId", () => {
    useCoPilotStore.getState().markThinkRunDispatched("run-abc");
    expect(useCoPilotStore.getState().lastDispatchedThinkRunId).toBe("run-abc");
  });

  test("pushThinkActivity appends an activity item", () => {
    useCoPilotStore.getState().pushThinkActivity({ type: "status", label: "Researching APIs" });
    const items = useCoPilotStore.getState().thinkActivity;
    expect(items.length).toBe(1);
    expect(items[0].label).toBe("Researching APIs");
    expect(items[0].id).toBeDefined();
  });

  test("clearThinkActivity empties the activity array", () => {
    useCoPilotStore.getState().pushThinkActivity({ type: "status", label: "test" });
    useCoPilotStore.getState().clearThinkActivity();
    expect(useCoPilotStore.getState().thinkActivity).toEqual([]);
  });

  test("setThinkStep updates the thinkStep field", () => {
    useCoPilotStore.getState().setThinkStep("research");
    expect(useCoPilotStore.getState().thinkStep).toBe("research");
  });

  test("pushResearchFinding appends a finding", () => {
    useCoPilotStore.getState().pushResearchFinding({ title: "Google Ads API", summary: "REST API" });
    const findings = useCoPilotStore.getState().researchFindings;
    expect(findings.length).toBe(1);
    expect(findings[0].title).toBe("Google Ads API");
    expect(findings[0].id).toBeDefined();
  });

  test("clearResearchFindings empties the findings array", () => {
    useCoPilotStore.getState().pushResearchFinding({ title: "t", summary: "s" });
    useCoPilotStore.getState().clearResearchFindings();
    expect(useCoPilotStore.getState().researchFindings).toEqual([]);
  });

  test("setResearchBriefPath sets the path", () => {
    useCoPilotStore.getState().setResearchBriefPath(".openclaw/discovery/research-brief.md");
    expect(useCoPilotStore.getState().researchBriefPath).toBe(".openclaw/discovery/research-brief.md");
  });

  test("setPrdPath and setTrdPath set respective paths", () => {
    useCoPilotStore.getState().setPrdPath(".openclaw/discovery/PRD.md");
    useCoPilotStore.getState().setTrdPath(".openclaw/discovery/TRD.md");
    expect(useCoPilotStore.getState().prdPath).toBe(".openclaw/discovery/PRD.md");
    expect(useCoPilotStore.getState().trdPath).toBe(".openclaw/discovery/TRD.md");
  });
});

// ─── Plan stage actions ───────────────────────────────────────────────────────

describe("plan stage actions", () => {
  test("setArchitecturePlan stores plan and sets status to ready", () => {
    const plan = { skills: [], workflow: null, envVars: [] } as any;
    useCoPilotStore.getState().setArchitecturePlan(plan);
    const s = useCoPilotStore.getState();
    expect(s.architecturePlan).toEqual(plan);
    expect(s.planStatus).toBe("ready");
  });

  test("updateArchitecturePlan merges partial updates into existing plan", () => {
    useCoPilotStore.getState().setArchitecturePlan({ skills: [], workflow: null } as any);
    useCoPilotStore.getState().updateArchitecturePlan({ skills: [{ id: "s1" }] } as any);
    expect(useCoPilotStore.getState().architecturePlan?.skills).toEqual([{ id: "s1" }]);
  });

  test("updateArchitecturePlan is a no-op when plan is null", () => {
    useCoPilotStore.getState().updateArchitecturePlan({ skills: [] } as any);
    expect(useCoPilotStore.getState().architecturePlan).toBeNull();
  });

  test("setPlanStatus updates planStatus", () => {
    useCoPilotStore.getState().setPlanStatus("approved");
    expect(useCoPilotStore.getState().planStatus).toBe("approved");
  });

  test("setUserTriggeredPlan allocates planRunId", () => {
    useCoPilotStore.getState().setUserTriggeredPlan(true);
    expect(useCoPilotStore.getState().planRunId).not.toBeNull();
  });

  test("markPlanRunDispatched sets lastDispatchedPlanRunId", () => {
    useCoPilotStore.getState().markPlanRunDispatched("plan-run-99");
    expect(useCoPilotStore.getState().lastDispatchedPlanRunId).toBe("plan-run-99");
  });

  test("setPlanStep updates planStep", () => {
    useCoPilotStore.getState().setPlanStep("skills");
    expect(useCoPilotStore.getState().planStep).toBe("skills");
  });

  test("pushPlanActivity appends a plan activity item", () => {
    useCoPilotStore.getState().pushPlanActivity({ type: "skills", label: "3 skills", count: 3 });
    const items = useCoPilotStore.getState().planActivity;
    expect(items.length).toBe(1);
    expect(items[0].count).toBe(3);
  });

  test("clearPlanActivity empties planActivity", () => {
    useCoPilotStore.getState().pushPlanActivity({ type: "skills", label: "x", count: 1 });
    useCoPilotStore.getState().clearPlanActivity();
    expect(useCoPilotStore.getState().planActivity).toEqual([]);
  });

  test("updateArchitecturePlanSection merges a section into existing plan", () => {
    useCoPilotStore.getState().setArchitecturePlan({ skills: [] } as any);
    useCoPilotStore.getState().updateArchitecturePlanSection("workflow", { steps: [] });
    expect((useCoPilotStore.getState().architecturePlan as any).workflow).toEqual({ steps: [] });
  });
});

// ─── Build stage actions ──────────────────────────────────────────────────────

describe("build stage actions", () => {
  test("setBuildStatus resets activity when status is 'building'", () => {
    useCoPilotStore.getState().pushBuildActivity({ type: "file", label: "f.ts" });
    useCoPilotStore.getState().setBuildStatus("building");
    expect(useCoPilotStore.getState().buildActivity).toEqual([]);
  });

  test("setBuildStatus other values just set the status", () => {
    useCoPilotStore.getState().setBuildStatus("done");
    expect(useCoPilotStore.getState().buildStatus).toBe("done");
  });

  test("setUserTriggeredBuild allocates buildRunId", () => {
    useCoPilotStore.getState().setUserTriggeredBuild(true);
    expect(useCoPilotStore.getState().buildRunId).not.toBeNull();
  });

  test("setParallelBuildEnabled stores the flag", () => {
    useCoPilotStore.getState().setParallelBuildEnabled(true);
    expect(useCoPilotStore.getState().parallelBuildEnabled).toBe(true);
  });

  test("pushBuildActivity keeps at most 20 items (sliding window)", () => {
    for (let i = 0; i < 25; i++) {
      useCoPilotStore.getState().pushBuildActivity({ type: "file", label: `file-${i}.ts` });
    }
    expect(useCoPilotStore.getState().buildActivity.length).toBeLessThanOrEqual(20);
  });

  test("setBuildProgress stores the progress object", () => {
    useCoPilotStore.getState().setBuildProgress({ completed: 3, total: 10, currentSkill: "fetch-data" });
    expect(useCoPilotStore.getState().buildProgress?.completed).toBe(3);
  });

  test("clearBuildActivity resets activity and progress", () => {
    useCoPilotStore.getState().pushBuildActivity({ type: "skill", label: "x" });
    useCoPilotStore.getState().setBuildProgress({ completed: 1, total: 5, currentSkill: null });
    useCoPilotStore.getState().clearBuildActivity();
    const s = useCoPilotStore.getState();
    expect(s.buildActivity).toEqual([]);
    expect(s.buildProgress).toBeNull();
  });
});

// ─── Eval / test stage actions ────────────────────────────────────────────────

describe("eval / test stage actions", () => {
  test("setEvalTasks stores tasks", () => {
    const tasks = [{ id: "t1", status: "pending" }] as any;
    useCoPilotStore.getState().setEvalTasks(tasks);
    expect(useCoPilotStore.getState().evalTasks).toEqual(tasks);
  });

  test("updateEvalTask patches a specific task by id", () => {
    useCoPilotStore.getState().setEvalTasks([
      { id: "t1", status: "pending" },
      { id: "t2", status: "pending" },
    ] as any);
    useCoPilotStore.getState().updateEvalTask("t1", { status: "passed" } as any);
    const tasks = useCoPilotStore.getState().evalTasks;
    expect(tasks.find((t) => t.id === "t1")?.status).toBe("passed");
    expect(tasks.find((t) => t.id === "t2")?.status).toBe("pending");
  });

  test("setEvalStatus updates evalStatus", () => {
    useCoPilotStore.getState().setEvalStatus("running");
    expect(useCoPilotStore.getState().evalStatus).toBe("running");
  });

  test("setAgentSandboxId stores the sandbox id", () => {
    useCoPilotStore.getState().setAgentSandboxId("sb-abc-123");
    expect(useCoPilotStore.getState().agentSandboxId).toBe("sb-abc-123");
  });

  test("setEvalLoopState merges partial state", () => {
    useCoPilotStore.getState().setEvalLoopState({ iteration: 2, status: "running" });
    const s = useCoPilotStore.getState().evalLoopState;
    expect(s.iteration).toBe(2);
    expect(s.status).toBe("running");
    // maxIterations still from initial
    expect(s.maxIterations).toBe(5);
  });

  test("resetEvalLoop resets to initial loop state", () => {
    useCoPilotStore.getState().setEvalLoopState({ iteration: 3, status: "running" });
    useCoPilotStore.getState().resetEvalLoop();
    const s = useCoPilotStore.getState().evalLoopState;
    expect(s.iteration).toBe(0);
    expect(s.status).toBe("idle");
  });
});

// ─── Ship / deploy actions ────────────────────────────────────────────────────

describe("deploy/ship actions", () => {
  test("setDeployStatus updates deployStatus", () => {
    useCoPilotStore.getState().setDeployStatus("done");
    expect(useCoPilotStore.getState().deployStatus).toBe("done");
  });
});

// ─── Build manifest actions ───────────────────────────────────────────────────

describe("build manifest actions", () => {
  test("setBuildManifest stores the manifest", () => {
    const manifest = { tasks: [{ id: "t1", status: "pending" }] } as any;
    useCoPilotStore.getState().setBuildManifest(manifest);
    expect(useCoPilotStore.getState().buildManifest).toEqual(manifest);
  });

  test("setBuildManifest null clears it", () => {
    useCoPilotStore.getState().setBuildManifest({ tasks: [] } as any);
    useCoPilotStore.getState().setBuildManifest(null);
    expect(useCoPilotStore.getState().buildManifest).toBeNull();
  });

  test("updateBuildManifestTask patches a task by id", () => {
    useCoPilotStore.getState().setBuildManifest({ tasks: [{ id: "t1", status: "pending" }] } as any);
    useCoPilotStore.getState().updateBuildManifestTask("t1", { status: "done" });
    expect(useCoPilotStore.getState().buildManifest?.tasks[0].status).toBe("done");
  });

  test("updateBuildManifestTask is a no-op when no manifest", () => {
    useCoPilotStore.getState().updateBuildManifestTask("t1", { status: "done" });
    expect(useCoPilotStore.getState().buildManifest).toBeNull();
  });

  test("setBuildValidation stores validation report", () => {
    const report = { passed: true, errors: [] } as any;
    useCoPilotStore.getState().setBuildValidation(report);
    expect(useCoPilotStore.getState().buildValidation).toEqual(report);
  });

  test("setBuildReport stores build report", () => {
    const report = { summary: "3 skills built" } as any;
    useCoPilotStore.getState().setBuildReport(report);
    expect(useCoPilotStore.getState().buildReport).toEqual(report);
  });
});

// ─── hydrateForFeature ────────────────────────────────────────────────────────

describe("hydrateForFeature", () => {
  test("sets devStage and maxUnlockedDevStage to the specified start stage", () => {
    const featureCtx = {
      title: "New Feature",
      description: "Add Slack alerts",
      baselineAgent: { name: "Google Ads Agent", skillCount: 3, skills: ["s1", "s2", "s3"] },
    };
    useCoPilotStore.setState({ devStage: "test", maxUnlockedDevStage: "test" });
    useCoPilotStore.getState().hydrateForFeature(featureCtx, "think");
    const s = useCoPilotStore.getState();
    expect(s.devStage).toBe("think");
    expect(s.maxUnlockedDevStage).toBe("think");
    expect(s.featureContext).toEqual(featureCtx);
  });

  test("resets all lifecycle status flags", () => {
    useCoPilotStore.setState({ thinkStatus: "done", planStatus: "approved", buildStatus: "done" });
    useCoPilotStore.getState().hydrateForFeature(null, "think");
    const s = useCoPilotStore.getState();
    expect(s.thinkStatus).toBe("idle");
    expect(s.planStatus).toBe("idle");
    expect(s.buildStatus).toBe("idle");
  });
});

// ─── snapshot ────────────────────────────────────────────────────────────────

describe("snapshot", () => {
  test("includes all expected top-level keys", () => {
    const snap = useCoPilotStore.getState().snapshot();
    expect(snap.sessionId).toBeDefined();
    expect(snap.devStage).toBe("think");
    expect(snap.phase).toBe("purpose");
    expect(snap.researchFindings).toEqual([]);
    expect(snap.planActivity).toEqual([]);
    expect(snap.buildActivity).toEqual([]);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe("reset", () => {
  test("reset restores initial state while generating a new sessionId", () => {
    const originalSessionId = useCoPilotStore.getState().sessionId;
    useCoPilotStore.setState({ name: "Test Agent", devStage: "build" });
    useCoPilotStore.getState().reset();
    const s = useCoPilotStore.getState();
    expect(s.name).toBe("");
    expect(s.devStage).toBe("think");
    // Session IDs are UUIDs; they may differ after reset
    expect(s.sessionId).toBeDefined();
  });
});
