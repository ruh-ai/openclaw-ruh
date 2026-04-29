# Interactive Dashboard Prototype Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Prototype stage simulate real dashboard work: creating a work item, running a pipeline, reviewing generated artifacts, and approving or requesting revision before Build starts.

**Architecture:** Extend `dashboardPrototype` with optional operational fields (`actions`, `pipeline`, `artifacts`, `emptyState`) while preserving the existing page/workflow contract. The frontend prototype builds a view model with fallbacks when those fields are absent, then runs a local-only simulation. The backend scaffold renders the same pipeline and artifact contract into generated dashboard pages so the built dashboard matches the reviewed prototype.

**Tech Stack:** Next.js 15, React, Zustand, TypeScript, Bun tests, Express/Bun backend scaffold generation.

---

### Task 1: Extend Prototype Contract And Normalization

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/types.ts`
- Modify: `agent-builder-ui/lib/openclaw/plan-formatter.ts`
- Test: `agent-builder-ui/lib/openclaw/plan-formatter.test.ts`
- Modify: `ruh-backend/src/scaffoldTemplates.ts`
- Test: `ruh-backend/tests/unit/scaffoldTemplates.test.ts`

**Step 1: Write failing tests**

Add tests that pass a `dashboardPrototype` with:
- `actions[]`
- `pipeline.steps[]`
- `artifacts[]`
- `emptyState`

Assert frontend normalization preserves them and backend scaffold output includes their labels.

**Step 2: Run tests to verify failure**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/plan-formatter.test.ts ruh-backend/tests/unit/scaffoldTemplates.test.ts
```

Expected: FAIL because the new fields are ignored.

**Step 3: Implement minimal contract support**

Add interfaces and normalization helpers for:
- `DashboardPrototypeAction`
- `DashboardPrototypePipelineStep`
- `DashboardPrototypePipeline`
- `DashboardPrototypeArtifact`

Keep all fields optional and backward compatible.

**Step 4: Run tests to verify pass**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/plan-formatter.test.ts ruh-backend/tests/unit/scaffoldTemplates.test.ts
```

Expected: PASS.

### Task 2: Build Interactive Prototype View Model

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/dashboard-prototype.ts`
- Test: `agent-builder-ui/lib/openclaw/dashboard-prototype.test.ts`

**Step 1: Write failing tests**

Add tests for:
- explicit action/pipeline/artifact fields
- fallback pipeline derivation from workflows when explicit pipeline is absent
- action grouping for primary actions vs artifact review actions

**Step 2: Run test to verify failure**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/dashboard-prototype.test.ts
```

Expected: FAIL because the view model lacks these fields.

**Step 3: Implement view-model additions**

Expose:
- `actions`
- `primaryActions`
- `pipeline`
- `artifacts`
- `emptyState`

Fallback behavior:
- first `create_*` action becomes the create CTA
- first `run_*` or `start_*` action becomes the pipeline CTA
- workflow steps become pipeline steps when `pipeline` is absent
- generic artifacts are derived for dashboard agents when none are specified

**Step 4: Run test to verify pass**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/dashboard-prototype.test.ts
```

Expected: PASS.

### Task 3: Implement StagePrototype Simulation

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`

**Step 1: Add local simulation state**

Inside `StagePrototype`, track:
- whether a sample work item exists
- current pipeline step index
- pipeline status (`idle`, `running`, `blocked`, `complete`)
- generated artifact states
- selected artifact
- activity log

**Step 2: Add prototype controls**

Add buttons for:
- create sample work item
- run/advance pipeline
- mark blocker
- approve artifact
- request revision

All actions update local state only.

**Step 3: Render operational panels**

Add panels for:
- primary action bar
- pipeline tracker
- generated artifacts
- activity log

Keep the existing page/workflow/review rail.

**Step 4: Run targeted tests**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/dashboard-prototype.test.ts agent-builder-ui/lib/openclaw/copilot-state.test.ts agent-builder-ui/lib/openclaw/stage-context.test.ts
```

Expected: PASS.

### Task 4: Update Architect Prompt And Agent Builder Playbook

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- Test: `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`
- Modify: `.claude/skills/agent-builder/SKILL.md`
- Modify: `ruh-backend/skills/agent-builder/SKILL.md`

**Step 1: Write failing tests**

Assert the Plan instruction requires dashboard prototypes to include:
- mutating dashboard actions
- pipeline steps
- generated artifacts
- blocker/revision states

**Step 2: Run tests**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts
```

Expected: FAIL until prompt text is updated.

**Step 3: Update prompt and playbook**

Revise PRD/TRD/Plan guidance so dashboard agents specify:
- creation workflows
- pipeline tracking
- generated artifacts
- approval gates
- artifact revision flow

**Step 4: Run tests**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts
```

Expected: PASS.

### Task 5: Carry Pipeline/Artifact Contract Into Generated Dashboard

**Files:**
- Modify: `ruh-backend/src/scaffoldTemplates.ts`
- Test: `ruh-backend/tests/unit/scaffoldTemplates.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/scaffold-templates.ts`
- Test: `agent-builder-ui/lib/openclaw/scaffold-templates.test.ts`

**Step 1: Add scaffold tests**

Assert generated dashboard page content includes:
- pipeline title
- pipeline step labels
- artifact names
- action labels

**Step 2: Implement renderer updates**

Extend `DashboardPrototypePanel` generation to include:
- action list
- pipeline tracker summary
- generated artifacts list

**Step 3: Run tests**

Run:
```bash
bun test ruh-backend/tests/unit/scaffoldTemplates.test.ts agent-builder-ui/lib/openclaw/scaffold-templates.test.ts
```

Expected: PASS.

### Task 6: Update KB And Verify

**Files:**
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-creation-v3-build-pipeline.md`

**Step 1: Update docs**

Document:
- interactive simulated Prototype semantics
- pipeline/artifact fields in `dashboardPrototype`
- dashboard agents needing create/run/review/approve workflows

**Step 2: Run verification**

Run:
```bash
bun test agent-builder-ui/lib/openclaw/dashboard-prototype.test.ts agent-builder-ui/lib/openclaw/plan-formatter.test.ts agent-builder-ui/lib/openclaw/scaffold-templates.test.ts agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts
bun test ruh-backend/tests/unit/scaffoldTemplates.test.ts
npm run typecheck:backend
npm run kb:check
git diff --check
```

Expected: all pass.

**Step 3: Browser verification**

Open the current builder agent in the in-app browser:

`http://localhost:4000/agents/create?agentId=748cbae2-8a66-42cf-80ae-0d99ff430d77`

Verify:
- Prototype stage shows create/run controls
- creating sample estimate updates the prototype
- running pipeline advances steps and creates artifacts
- artifact approve/revision controls update state
- Build still starts only after `Approve Prototype & Start Build`
