# Dashboard Prototype Stage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real Prototype lifecycle stage between Plan and Build so operators can inspect an interactive dashboard prototype before the build pipeline starts.

**Architecture:** `prototype` becomes a first-class `AgentDevStage` shared by the builder UI and backend forge-stage persistence. Plan approval advances to Prototype; Prototype approval starts the existing server-side Build path. The prototype UI renders from `ArchitecturePlan.dashboardPages`, `dashboardPrototype`, and `subAgents`; no pre-build dashboard files or preview server are created.

**Tech Stack:** Next.js 15, React, Zustand, Bun tests, Express/Bun backend.

---

### Task 1: Lifecycle Type And Gate Tests

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/types.ts`
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Test: `agent-builder-ui/lib/openclaw/copilot-state.test.ts`
- Modify: `ruh-backend/src/agentStore.ts`
- Modify: `ruh-backend/src/app.ts`

**Step 1: Write failing tests**

Add tests proving:
- `AGENT_DEV_STAGES` contains `"prototype"` between `"plan"` and `"build"`.
- advancing from approved Plan lands on Prototype, not Build.
- Prototype cannot advance to Build when dashboard pages exist without a valid `dashboardPrototype`.
- Prototype advances to Build when the prototype spec is present.

**Step 2: Run test to verify failure**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/copilot-state.test.ts
```

Expected: FAIL because `prototype` is not in `AgentDevStage`.

**Step 3: Implement minimal lifecycle changes**

Update:
- `AgentDevStage` union and `AGENT_DEV_STAGES`
- `canAdvanceDevStage()` and `advanceDevStage()`
- `goBackDevStage()` reset map
- `AgentForgeStage` backend union and `VALID_FORGE_STAGES`

**Step 4: Run test to verify pass**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/copilot-state.test.ts
```

Expected: PASS.

### Task 2: Stage Context Tests

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/stage-context.ts`
- Test: `agent-builder-ui/lib/openclaw/stage-context.test.ts`

**Step 1: Write failing tests**

Add tests proving:
- Prototype stage is ready and approvable when the plan has a valid dashboard prototype.
- Prototype stage is blocked when dashboard pages exist but `dashboardPrototype` is missing.

**Step 2: Run test to verify failure**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/stage-context.test.ts
```

Expected: FAIL because stage context does not know Prototype.

**Step 3: Implement context changes**

Teach `resolveStageContext()` to classify Prototype as a Plan artifact review stage with approve/request-changes actions.

**Step 4: Run test to verify pass**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/stage-context.test.ts
```

Expected: PASS.

### Task 3: Plan Formatter And Prompt Contract Tests

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/plan-formatter.ts`
- Test: `agent-builder-ui/lib/openclaw/plan-formatter.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- Test: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`
- Modify: `.claude/skills/agent-builder/SKILL.md`
- Modify: `ruh-backend/skills/agent-builder/SKILL.md`

**Step 1: Write failing tests**

Add tests proving:
- `renderPlanSummary()` includes a visible `Sub-Agents` section with skill ownership and autonomy.
- `THINK_SYSTEM_INSTRUCTION` asks for PRD/TRD sections that match current Build: dashboard prototype expectations and sub-agent ownership.
- `PLAN_SYSTEM_INSTRUCTION` tells the architect to emit sub-agents when TRD names a fleet.

**Step 2: Run test to verify failure**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/plan-formatter.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts
```

Expected: FAIL until formatter/prompt text is updated.

**Step 3: Implement prompt and formatter changes**

Update PRD/TRD templates, the agent-builder playbook mirrors, and `renderPlanSummary()`.

**Step 4: Run test to verify pass**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/plan-formatter.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts
```

Expected: PASS.

### Task 4: Prototype Stage UI

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`

**Step 1: Implement UI using existing tested gates**

Update:
- Stage metadata and placeholders for Prototype
- Plan approval copy to `Approve Plan & Review Prototype`
- New `StagePrototype` that renders a full interactive prototype from plan data
- `CoPilotLayout` so Plan approval confirms `prototype`, while Prototype approval starts Build

**Step 2: Verify with targeted unit tests**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/copilot-state.test.ts agent-builder-ui/lib/openclaw/stage-context.test.ts
```

Expected: PASS.

### Task 5: KB And Full Verification

**Files:**
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-creation-v3-build-pipeline.md`

**Step 1: Update docs**

Document the 8-stage lifecycle, Prototype timing, sub-agent visibility, and PRD/TRD structure.

**Step 2: Run focused tests and typecheck**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/plan-formatter.test.ts agent-builder-ui/lib/openclaw/copilot-state.test.ts agent-builder-ui/lib/openclaw/stage-context.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts agent-builder-ui/lib/openclaw/task-plan-parser.test.ts agent-builder-ui/lib/openclaw/scaffold-templates.test.ts
cd agent-builder-ui && npm run typecheck
git diff --check
```

Expected: all pass.

**Step 3: Browser verification**

Use the running builder at `http://localhost:4000/agents/create?agentId=54b6c046-2106-4ee3-8fc8-05fc6e9499b1`:
- Confirm Plan button advances to Prototype, not Build
- Confirm Prototype stage shows page navigation, mock dashboard panels, workflows, actions, acceptance checks, and sub-agent ownership when present
- Confirm Build does not start until Prototype approval
