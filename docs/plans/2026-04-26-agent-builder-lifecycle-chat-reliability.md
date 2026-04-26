# Agent Builder Lifecycle Chat Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agent creation reliable, stage-aware, revision-friendly, and safe from accidental external effects.

**Architecture:** The backend becomes the authority for lifecycle truth, while the frontend chat becomes a stage-aware command surface attached to the selected lifecycle artifact. Build/Test/Ship become separate gates: Build produces durable artifacts and a build report, Test runs only after backend-confirmed readiness, and Ship requires explicit confirmation before GitHub or marketplace side effects.

**Tech Stack:** Next.js 15, React, Zustand, Bun tests, Express/Bun backend, PostgreSQL, Docker-backed OpenClaw sandboxes, SSE build streams, Playwright for E2E.

**Current implementation status:** Tasks 1-7 are complete. The next phase is Task 8, removing implicit Ship and marketplace side effects.

---

## Success Criteria

- Chat suggestions are derived from `devStage`, artifact readiness, build/test status, and selected artifact target.
- Users can revise PRD, TRD, Plan, Build outputs, and Review recommendations before advancing.
- Chat messages include explicit mode and target context so the architect edits the right artifact instead of replying generically.
- Frontend lifecycle stage does not advance from optimistic local state alone.
- Build report persists exact setup/build/verify outcomes and drives Review/Test readiness.
- Ship, GitHub push, marketplace publish, and activation never happen without an explicit Ship-stage user action.
- A golden creation QA test catches regressions in Think, Plan, Build, Review/Test readiness, and Ship safety.

---

## Task 1: Add Stage Context and Artifact Target Model

**Files:**
- Create: `agent-builder-ui/lib/openclaw/stage-context.ts`
- Test: `agent-builder-ui/lib/openclaw/stage-context.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/types.ts`

**Step 1: Write failing tests**

Add tests for deriving stage context from store-like inputs:

```ts
import { describe, expect, test } from "bun:test";
import { resolveStageContext } from "./stage-context";

describe("resolveStageContext", () => {
  test("marks PRD revision context when Think has PRD but not approved", () => {
    const ctx = resolveStageContext({
      devStage: "think",
      thinkStatus: "ready",
      planStatus: "idle",
      buildStatus: "idle",
      deployStatus: "idle",
      discoveryDocuments: { prd: { title: "PRD", sections: [] }, trd: null },
      architecturePlan: null,
      buildManifest: null,
      buildReport: null,
      selectedArtifact: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
    });

    expect(ctx.mode).toBe("revise");
    expect(ctx.primaryArtifact?.kind).toBe("prd");
    expect(ctx.allowedActions).toContain("request_changes");
    expect(ctx.allowedActions).toContain("approve");
  });

  test("blocks ship context until test readiness is backend-confirmed", () => {
    const ctx = resolveStageContext({
      devStage: "ship",
      thinkStatus: "done",
      planStatus: "done",
      buildStatus: "done",
      deployStatus: "idle",
      discoveryDocuments: null,
      architecturePlan: null,
      buildManifest: null,
      buildReport: { readiness: "blocked", checks: [] },
      selectedArtifact: null,
    });

    expect(ctx.allowedActions).not.toContain("ship");
    expect(ctx.readiness).toBe("blocked");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd agent-builder-ui
bun test ./lib/openclaw/stage-context.test.ts
```

Expected: fails because `stage-context.ts` does not exist.

**Step 3: Implement minimal model**

Add:

```ts
import type { AgentDevStage, StageStatus } from "./types";

export type ChatMode = "ask" | "revise" | "debug" | "approve";
export type ArtifactKind = "research" | "prd" | "trd" | "plan" | "build_report" | "review" | "test_report";
export type StageAction =
  | "ask"
  | "request_changes"
  | "approve"
  | "regenerate"
  | "compare"
  | "debug"
  | "retry_build"
  | "run_test"
  | "ship";

export interface ArtifactTarget {
  kind: ArtifactKind;
  path?: string;
  section?: string;
}

export interface StageContextInput {
  devStage: AgentDevStage;
  thinkStatus: StageStatus;
  planStatus: StageStatus;
  buildStatus: StageStatus;
  deployStatus: StageStatus;
  discoveryDocuments: unknown;
  architecturePlan: unknown;
  buildManifest: unknown;
  buildReport: null | { readiness: "blocked" | "test-ready" | "ship-ready"; checks: unknown[] };
  selectedArtifact: ArtifactTarget | null;
}

export interface StageContext {
  stage: AgentDevStage;
  mode: ChatMode;
  primaryArtifact: ArtifactTarget | null;
  readiness: "draft" | "blocked" | "ready" | "test-ready" | "ship-ready";
  allowedActions: StageAction[];
}

export function resolveStageContext(input: StageContextInput): StageContext {
  const artifact = input.selectedArtifact;
  const allowed = new Set<StageAction>(["ask"]);

  if (artifact) {
    allowed.add("request_changes");
    allowed.add("compare");
  }

  if (input.devStage === "build") {
    allowed.add("debug");
    allowed.add("retry_build");
  }

  if (input.devStage === "test" && input.buildReport?.readiness === "test-ready") {
    allowed.add("run_test");
  }

  if (input.devStage === "ship" && input.buildReport?.readiness === "ship-ready") {
    allowed.add("ship");
  }

  if (["ready", "done", "approved"].includes(input.thinkStatus) && input.devStage === "think") {
    allowed.add("approve");
  }
  if (["ready", "done", "approved"].includes(input.planStatus) && input.devStage === "plan") {
    allowed.add("approve");
  }
  if (input.buildStatus === "done" && input.devStage === "build") {
    allowed.add("approve");
  }

  return {
    stage: input.devStage,
    mode: artifact ? "revise" : input.devStage === "build" ? "debug" : "ask",
    primaryArtifact: artifact,
    readiness: input.buildReport?.readiness ?? "draft",
    allowedActions: Array.from(allowed),
  };
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd agent-builder-ui
bun test ./lib/openclaw/stage-context.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add agent-builder-ui/lib/openclaw/stage-context.ts agent-builder-ui/lib/openclaw/stage-context.test.ts agent-builder-ui/lib/openclaw/types.ts
git commit -m "feat: add agent builder stage context model"
```

---

## Task 2: Replace Generic Chat Suggestions with Stage-Aware Suggestions

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/builder-chat-suggestions.ts`
- Test: `agent-builder-ui/lib/openclaw/builder-chat-suggestions.test.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`

**Step 1: Write failing tests**

Extend `builder-chat-suggestions.test.ts`:

```ts
test("returns PRD revision suggestions when Think PRD is selected", () => {
  const suggestions = buildBuilderChatSuggestions({
    stageContext: {
      stage: "think",
      mode: "revise",
      readiness: "draft",
      primaryArtifact: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
      allowedActions: ["ask", "request_changes", "approve", "compare"],
    },
    agentName: "Google Ads Agent",
  });

  expect(suggestions).toEqual([
    expect.objectContaining({ label: "Revise PRD" }),
    expect.objectContaining({ label: "Add Missing Edge Cases" }),
    expect.objectContaining({ label: "Approve PRD" }),
  ]);
});

test("returns build-debug suggestions when build report is blocked", () => {
  const suggestions = buildBuilderChatSuggestions({
    stageContext: {
      stage: "build",
      mode: "debug",
      readiness: "blocked",
      primaryArtifact: { kind: "build_report", path: ".openclaw/build/build-report.json" },
      allowedActions: ["ask", "debug", "retry_build"],
    },
    agentName: "Builder Lifecycle Sentinel",
  });

  expect(suggestions.map((s) => s.label)).toContain("Explain Build Failure");
  expect(suggestions.map((s) => s.label)).toContain("Retry Failed Step");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd agent-builder-ui
bun test ./lib/openclaw/builder-chat-suggestions.test.ts
```

Expected: fails because the function does not accept `stageContext`.

**Step 3: Implement suggestions from `StageContext`**

Replace stage-only branching with artifact-aware suggestion tables:

```ts
import type { StageContext } from "./stage-context";

export interface BuilderChatSuggestion {
  label: string;
  prompt: string;
  mode?: "ask" | "revise" | "debug" | "approve";
}

export function buildBuilderChatSuggestions(input: {
  stageContext: StageContext;
  agentName: string;
}): BuilderChatSuggestion[] {
  const { stageContext, agentName } = input;
  const kind = stageContext.primaryArtifact?.kind;

  if (stageContext.stage === "think" && kind === "prd") {
    return [
      { label: "Revise PRD", mode: "revise", prompt: "Revise the PRD based on this feedback: " },
      { label: "Add Missing Edge Cases", mode: "revise", prompt: "Add missing edge cases and failure scenarios to the PRD." },
      { label: "Approve PRD", mode: "approve", prompt: "Approve the PRD and continue to the next Think artifact." },
    ];
  }

  if (stageContext.stage === "plan" && kind === "plan") {
    return [
      { label: "Split Skill", mode: "revise", prompt: "Split the selected skill into smaller focused skills." },
      { label: "Remove Integration", mode: "revise", prompt: "Remove unnecessary external integrations from the plan." },
      { label: "Approve Plan", mode: "approve", prompt: "Approve this plan and start Build." },
    ];
  }

  if (stageContext.stage === "build" && stageContext.readiness === "blocked") {
    return [
      { label: "Explain Build Failure", mode: "debug", prompt: "Explain the build failure using the build report and logs." },
      { label: "Retry Failed Step", mode: "debug", prompt: "Retry only the failed build/setup step." },
      { label: "Patch Generated Files", mode: "debug", prompt: "Patch the generated files needed to make Build pass." },
    ];
  }

  return [
    { label: `Ask about ${agentName}`, mode: "ask", prompt: `Explain the current ${stageContext.stage} state.` },
  ];
}
```

**Step 4: Wire `TabChat` to use `resolveStageContext`**

In `TabChat.tsx`, replace the current suggestion call with:

```ts
const stageContext = resolveStageContext({
  devStage: coPilotStore.devStage,
  thinkStatus: coPilotStore.thinkStatus,
  planStatus: coPilotStore.planStatus,
  buildStatus: coPilotStore.buildStatus,
  deployStatus: coPilotStore.deployStatus,
  discoveryDocuments: coPilotStore.discoveryDocuments,
  architecturePlan: coPilotStore.architecturePlan,
  buildManifest: coPilotStore.buildManifest,
  buildReport: coPilotStore.buildReport,
  selectedArtifact: coPilotStore.selectedArtifactTarget,
});

const suggestions = buildBuilderChatSuggestions({
  stageContext,
  agentName: builderState?.name ?? "agent",
});
```

**Step 5: Run tests**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/builder-chat-suggestions.test.ts ./app/(platform)/agents/[id]/chat/__tests__/tab-chat.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add agent-builder-ui/lib/openclaw/builder-chat-suggestions.ts agent-builder-ui/lib/openclaw/builder-chat-suggestions.test.ts agent-builder-ui/app/\(platform\)/agents/\[id\]/chat/_components/TabChat.tsx
git commit -m "feat: make builder chat suggestions stage aware"
```

---

## Task 3: Add Chat Mode and Artifact Context UI

**Files:**
- Create: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/ChatStageContextBar.tsx`
- Create: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/ChatModeControl.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Test: `agent-builder-ui/lib/openclaw/copilot-state.test.ts`

**Step 1: Write failing store tests**

Add to `copilot-state.test.ts`:

```ts
test("tracks selected artifact target and chat mode", () => {
  const store = useCoPilotStore.getState();

  store.setSelectedArtifactTarget({ kind: "plan", path: ".openclaw/plan/architecture.json" });
  store.setChatMode("revise");

  expect(useCoPilotStore.getState().selectedArtifactTarget).toEqual({
    kind: "plan",
    path: ".openclaw/plan/architecture.json",
  });
  expect(useCoPilotStore.getState().chatMode).toBe("revise");
});
```

**Step 2: Run test to verify it fails**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/copilot-state.test.ts
```

Expected: fails because fields/actions do not exist.

**Step 3: Add state fields**

In `copilot-state.ts`, add:

```ts
selectedArtifactTarget: ArtifactTarget | null;
chatMode: ChatMode;
setSelectedArtifactTarget: (target: ArtifactTarget | null) => void;
setChatMode: (mode: ChatMode) => void;
```

Implementation:

```ts
selectedArtifactTarget: null,
chatMode: "ask",
setSelectedArtifactTarget: (target) => set({ selectedArtifactTarget: target }),
setChatMode: (mode) => set({ chatMode: mode }),
```

Reset these fields in `reset()`.

**Step 4: Add context bar**

`ChatStageContextBar.tsx` should render:

- current stage label
- current chat mode
- selected artifact label
- readiness chip

Example component contract:

```tsx
export function ChatStageContextBar({ context }: { context: StageContext }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2 text-xs">
      <span>{context.stage}</span>
      <span>{context.mode}</span>
      {context.primaryArtifact ? <span>Editing: {context.primaryArtifact.kind}</span> : null}
      <span>{context.readiness}</span>
    </div>
  );
}
```

**Step 5: Add mode control**

`ChatModeControl.tsx`:

```tsx
const MODES = ["ask", "revise", "debug", "approve"] as const;

export function ChatModeControl({
  value,
  allowed,
  onChange,
}: {
  value: ChatMode;
  allowed: ChatMode[];
  onChange: (mode: ChatMode) => void;
}) {
  return (
    <div className="flex rounded-md border border-[var(--border-default)] p-0.5">
      {MODES.filter((mode) => allowed.includes(mode)).map((mode) => (
        <button key={mode} type="button" onClick={() => onChange(mode)}>
          {mode}
        </button>
      ))}
    </div>
  );
}
```

**Step 6: Wire into `TabChat`**

Render the context bar above chat messages and the mode control above the input.

**Step 7: Run tests**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/copilot-state.test.ts ./app/(platform)/agents/[id]/chat/__tests__/tab-chat.test.ts
```

Expected: pass.

**Step 8: Commit**

```bash
git add agent-builder-ui/lib/openclaw/copilot-state.ts agent-builder-ui/lib/openclaw/copilot-state.test.ts agent-builder-ui/app/\(platform\)/agents/\[id\]/chat/_components/ChatStageContextBar.tsx agent-builder-ui/app/\(platform\)/agents/\[id\]/chat/_components/ChatModeControl.tsx agent-builder-ui/app/\(platform\)/agents/\[id\]/chat/_components/TabChat.tsx
git commit -m "feat: add builder chat artifact context controls"
```

---

## Task 4: Make Artifact Revision First-Class

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/RequestChangesButton.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepDiscovery.tsx`
- Modify: `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts`
- Test: `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.test.ts`

**Step 1: Write failing tests**

Add tests asserting revision context forces REFINE mode even in Think/Plan:

```ts
test("uses REFINE instruction when chat mode revise targets PRD during Think", async () => {
  const result = await runBuilderAgentForTest({
    devStage: "think",
    chatMode: "revise",
    selectedArtifactTarget: { kind: "prd", path: ".openclaw/discovery/PRD.md" },
    message: "Make the PRD narrower.",
  });

  expect(result.systemInstruction).toContain("REFINE mode");
  expect(result.userMessage).toContain("[target: PRD");
});

test("uses REFINE instruction when chat mode revise targets architecture plan during Plan", async () => {
  const result = await runBuilderAgentForTest({
    devStage: "plan",
    chatMode: "revise",
    selectedArtifactTarget: { kind: "plan", path: ".openclaw/plan/architecture.json" },
    message: "Remove external APIs.",
  });

  expect(result.systemInstruction).toContain("REFINE mode");
  expect(result.userMessage).toContain("[target: architecture.json");
});
```

If `runBuilderAgentForTest` does not exist, add a small helper around the existing mocked bridge test utilities in `builder-agent.test.ts`.

**Step 2: Run tests to verify failure**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/ag-ui/builder-agent.test.ts
```

Expected: fails because revise context is not part of the builder prompt envelope.

**Step 3: Convert `RequestChangesButton` to set context**

Change props:

```ts
interface Props {
  target: ArtifactTarget;
  label?: string;
  disabled?: boolean;
  onRequestRevision: (target: ArtifactTarget) => void;
}
```

On click:

```ts
onRequestRevision(target);
```

Do not immediately send a generic chat message. The user should type the requested change into the chat input with the target chip visible.

**Step 4: Add prompt envelope helper**

In `builder-agent.ts`, add:

```ts
function composeContextualUserMessage(input: {
  message: string;
  chatMode: ChatMode;
  artifactTarget: ArtifactTarget | null;
  devStage: AgentDevStage;
}): string {
  const target = input.artifactTarget
    ? `[target: ${artifactLabel(input.artifactTarget)}]`
    : "[target: current-stage]";

  return [
    `[mode: ${input.chatMode}]`,
    `[stage: ${input.devStage}]`,
    target,
    input.message,
  ].join("\n");
}
```

Update system instruction routing:

```ts
if (chatMode === "revise" || selectedArtifactTarget) {
  systemInstruction = REFINE_SYSTEM_INSTRUCTION;
}
```

**Step 5: Wire lifecycle artifact panels**

In `LifecycleStepRenderer.tsx`, each generated artifact should call:

```ts
store.setSelectedArtifactTarget({ kind: "prd", path: ".openclaw/discovery/PRD.md" });
store.setChatMode("revise");
```

Targets:

- Research brief: `.openclaw/discovery/research-brief.md`
- PRD: `.openclaw/discovery/PRD.md`
- TRD: `.openclaw/discovery/TRD.md`
- Plan: `.openclaw/plan/architecture.json`
- Build report: `.openclaw/build/build-report.json`
- Test report: `.openclaw/test/test-report.json`

**Step 6: Run tests**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/ag-ui/builder-agent.test.ts ./lib/openclaw/copilot-state.test.ts
```

Expected: pass.

**Step 7: Commit**

```bash
git add agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts agent-builder-ui/lib/openclaw/ag-ui/builder-agent.test.ts agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/RequestChangesButton.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/LifecycleStepRenderer.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/configure/StepDiscovery.tsx
git commit -m "feat: make artifact revision explicit in builder chat"
```

---

## Task 5: Persist a Backend-Authoritative Build Report

**Files:**
- Modify: `ruh-backend/src/agentBuild.ts`
- Create: `ruh-backend/src/buildReport.ts`
- Test: `ruh-backend/tests/unit/buildReport.test.ts`
- Modify: `agent-builder-ui/lib/openclaw/types.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`

**Step 1: Write failing backend tests**

`buildReport.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { summarizeBuildReport } from "../../src/buildReport";

describe("summarizeBuildReport", () => {
  test("marks readiness blocked when required setup fails", () => {
    const report = summarizeBuildReport({
      manifestTasks: [{ specialist: "backend", status: "done" }],
      setup: [{ name: "migrate", ok: false, optional: false }],
      services: [{ name: "backend", healthy: true }],
      verification: { status: "done", checks: [] },
    });

    expect(report.readiness).toBe("blocked");
    expect(report.blockers[0]).toContain("migrate");
  });

  test("marks ship-ready only after build, setup, services, and verification pass", () => {
    const report = summarizeBuildReport({
      manifestTasks: [{ specialist: "verify", status: "done" }],
      setup: [{ name: "migrate", ok: true, optional: false }],
      services: [{ name: "backend", healthy: true }],
      verification: { status: "done", checks: [] },
    });

    expect(report.readiness).toBe("ship-ready");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd ruh-backend
bun test tests/unit/buildReport.test.ts
```

Expected: fails because `buildReport.ts` does not exist.

**Step 3: Implement report summarizer**

Create `ruh-backend/src/buildReport.ts`:

```ts
export type BuildReadiness = "blocked" | "test-ready" | "ship-ready";

export interface BuildReport {
  generatedAt: string;
  readiness: BuildReadiness;
  blockers: string[];
  warnings: string[];
  checks: Array<{ name: string; status: "pass" | "fail" | "warning"; detail?: string }>;
}

export function summarizeBuildReport(input: {
  manifestTasks: Array<{ specialist: string; status: string; error?: string }>;
  setup: Array<{ name: string; ok: boolean; optional?: boolean; output?: string }>;
  services: Array<{ name: string; healthy: boolean; optional?: boolean }>;
  verification: { status: string; checks: unknown[] };
}): BuildReport {
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const task of input.manifestTasks) {
    if (task.status === "failed") blockers.push(`Build task failed: ${task.specialist}`);
  }
  for (const step of input.setup) {
    if (!step.ok && step.optional) warnings.push(`Optional setup failed: ${step.name}`);
    if (!step.ok && !step.optional) blockers.push(`Required setup failed: ${step.name}`);
  }
  for (const service of input.services) {
    if (!service.healthy && !service.optional) blockers.push(`Required service unhealthy: ${service.name}`);
    if (!service.healthy && service.optional) warnings.push(`Optional service unhealthy: ${service.name}`);
  }

  const readiness = blockers.length > 0
    ? "blocked"
    : input.verification.status === "done"
      ? "ship-ready"
      : "test-ready";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    blockers,
    warnings,
    checks: [],
  };
}
```

**Step 4: Persist report from `agentBuild.ts`**

After setup and verification:

- write `.openclaw/build/build-report.json` to copilot workspace
- write `.openclaw/workspace/.openclaw/build/build-report.json` to main workspace
- emit SSE event:

```ts
yield { type: "build_report", report };
```

Extend `BuildEvent["type"]`.

**Step 5: Frontend consumes report**

In `CoPilotLayout.tsx`, handle `build_report`:

```ts
coPilotStore.setBuildReport(event.report);
coPilotStore.setBuildStatus(event.report.readiness === "blocked" ? "failed" : "done");
```

Add `buildReport` to `copilot-state.ts` if not already present.

**Step 6: Run tests**

```bash
cd ruh-backend
bun test tests/unit/buildReport.test.ts tests/unit/scaffoldTemplates.test.ts tests/unit/agentSetup.test.ts
bun run typecheck

cd ../agent-builder-ui
bun test ./lib/openclaw/copilot-state.test.ts
bun run typecheck
```

Expected: pass.

**Step 7: Commit**

```bash
git add ruh-backend/src/buildReport.ts ruh-backend/src/agentBuild.ts ruh-backend/tests/unit/buildReport.test.ts agent-builder-ui/lib/openclaw/types.ts agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/CoPilotLayout.tsx
git commit -m "feat: persist authoritative agent build reports"
```

---

## Task 6: Make Lifecycle Advancement Backend-Confirmed

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `ruh-backend/src/agentStore.ts`
- Test: `ruh-backend/tests/unit/z_routes/agentLifecycleApp.test.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Test: `agent-builder-ui/lib/openclaw/copilot-state.test.ts`

**Step 1: Write backend route tests**

Add tests for `PATCH /api/agents/:id/forge/stage`:

```ts
test("rejects review stage when build report is missing", async () => {
  const res = await invokeRoute("PATCH", "/api/agents/:id/forge/stage", makeReq({
    params: { id: "agent-1" },
    body: { stage: "review" },
    user: authUser,
  }));

  expect(res.status).toBe(409);
  expect(res.body.message).toContain("build report");
});

test("allows review stage when build report is test-ready or ship-ready", async () => {
  mockReadWorkspaceFile.mockResolvedValue(JSON.stringify({ readiness: "test-ready", blockers: [] }));

  const res = await invokeRoute("PATCH", "/api/agents/:id/forge/stage", makeReq({
    params: { id: "agent-1" },
    body: { stage: "review" },
    user: authUser,
  }));

  expect(res.status).toBe(200);
});
```

**Step 2: Run backend test to verify failure**

```bash
cd ruh-backend
bun test tests/unit/z_routes/agentLifecycleApp.test.ts
```

Expected: fails because stage endpoint allows optimistic advancement.

**Step 3: Enforce backend guards**

In `app.ts` stage patch handler:

- `review` requires `build-report.json` with readiness not `blocked`
- `test` requires `build-report.json` readiness `test-ready` or `ship-ready`
- `ship` requires a passed test report or explicit `testOverride` only in dev
- `complete` only from successful Ship endpoint

Do not infer readiness from UI store or local cache.

**Step 4: Update frontend**

Frontend `advanceDevStage()` should:

- ask backend to advance
- update local state from backend response
- show an error banner if backend rejects

Avoid:

```ts
set({ devStage: nextStage })
```

before backend confirmation.

**Step 5: Run tests**

```bash
cd ruh-backend
bun test tests/unit/z_routes/agentLifecycleApp.test.ts
bun run typecheck

cd ../agent-builder-ui
bun test ./lib/openclaw/copilot-state.test.ts
bun run typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add ruh-backend/src/app.ts ruh-backend/src/agentStore.ts ruh-backend/tests/unit/z_routes/agentLifecycleApp.test.ts agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/LifecycleStepRenderer.tsx agent-builder-ui/app/\(platform\)/agents/create/page.tsx agent-builder-ui/lib/openclaw/copilot-state.ts agent-builder-ui/lib/openclaw/copilot-state.test.ts
git commit -m "fix: require backend-confirmed lifecycle advancement"
```

---

## Task 7: Add Build Report Panel and Artifact Action Bar

**Files:**
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/ArtifactActionBar.tsx`
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/BuildReportPanel.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepDiscovery.tsx`
- Test: `agent-builder-ui/app/(platform)/agents/create/__tests__/copilot-components.test.tsx`

**Status:** Complete. Build report UI is rendered from persisted build report state, and the shared artifact action bar is wired across PRD/TRD, Plan, Build report, Review summary, and Test report.

**Step 1: Write failing component tests**

Add tests:

```tsx
test("BuildReportPanel shows blockers and retry action", () => {
  render(
    <BuildReportPanel
      report={{
        readiness: "blocked",
        blockers: ["Required setup failed: dashboard-build"],
        warnings: [],
        checks: [],
        generatedAt: "2026-04-26T00:00:00.000Z",
      }}
      onRetryFailedStep={mockRetry}
      onSelectArtifact={mockSelect}
    />,
  );

  expect(screen.getByText("Required setup failed: dashboard-build")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry failed step" })).toBeEnabled();
});
```

**Step 2: Run test to verify failure**

```bash
cd agent-builder-ui
bun test ./app/\(platform\)/agents/create/__tests__/copilot-components.test.tsx
```

Expected: fails because components do not exist.

**Step 3: Implement `ArtifactActionBar`**

Props:

```ts
interface ArtifactActionBarProps {
  target: ArtifactTarget;
  canApprove: boolean;
  canRegenerate: boolean;
  onApprove: () => void;
  onRequestChanges: (target: ArtifactTarget) => void;
  onRegenerate: (target: ArtifactTarget) => void;
  onCompare: (target: ArtifactTarget) => void;
  onExplain: (target: ArtifactTarget) => void;
}
```

Actions:

- Approve
- Request Changes
- Regenerate
- Compare Changes
- Explain
- Open Files

**Step 4: Implement `BuildReportPanel`**

Show:

- readiness chip
- blockers
- warnings
- setup steps
- service health
- verification status
- retry failed step button

**Step 5: Wire panels into lifecycle renderer**

Add action bars to:

- PRD
- TRD
- Plan
- Build report
- Review summary
- Test report

Each action should set `selectedArtifactTarget` and `chatMode`.

**Step 6: Run tests**

```bash
cd agent-builder-ui
bun test ./app/\(platform\)/agents/create/__tests__/copilot-components.test.tsx
bun run typecheck
```

Expected: pass.

**Step 7: Commit**

```bash
git add agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/ArtifactActionBar.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/BuildReportPanel.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/LifecycleStepRenderer.tsx agent-builder-ui/app/\(platform\)/agents/create/__tests__/copilot-components.test.tsx
git commit -m "feat: add artifact actions and build report UI"
```

---

## Task 8: Remove Implicit Ship and Marketplace Side Effects

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`
- Modify: `ruh-backend/src/app.ts`
- Test: `ruh-backend/tests/unit/z_routes/agentShipApp.test.ts`
- Test: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts`

**Step 1: Write failing backend tests**

```ts
test("ship endpoint requires explicit confirmation", async () => {
  const res = await invokeRoute("POST", "/api/agents/:id/ship", makeReq({
    params: { id: "agent-1" },
    body: { commitMessage: "ship: agent" },
    user: authUser,
  }));

  expect(res.status).toBe(400);
  expect(res.body.message).toContain("confirmation");
});

test("ship endpoint accepts explicit confirmation", async () => {
  const res = await invokeRoute("POST", "/api/agents/:id/ship", makeReq({
    params: { id: "agent-1" },
    body: { commitMessage: "ship: agent", confirmedExternalEffects: true },
    user: authUser,
  }));

  expect(res.status).toBe(200);
});
```

**Step 2: Run test to verify failure**

```bash
cd ruh-backend
bun test tests/unit/z_routes/agentShipApp.test.ts
```

Expected: first test fails because endpoint does not require explicit confirmation.

**Step 3: Backend guard**

In `/api/agents/:id/ship`:

```ts
if (req.body.confirmedExternalEffects !== true) {
  throw httpError(400, "Ship requires explicit confirmation of GitHub push and repository changes");
}
```

**Step 4: Remove implicit frontend calls**

In `page.tsx`:

- remove non-forge auto GitHub push from `handleCoPilotComplete`
- remove `autoPublishToMarketplace` from generic finalization
- finalization can save config and mark local stage only, but must not publish/push

In `LifecycleStepRenderer.tsx` Ship stage:

- show confirmation summary:
  - GitHub repo owner/name
  - marketplace publish toggle
  - activation toggle
- call ship with:

```ts
body: JSON.stringify({
  commitMessage,
  confirmedExternalEffects: true,
  publishMarketplace: marketplaceChecked,
  activateAgent: activateChecked,
})
```

Marketplace publish should run only from Ship stage after confirmation, not from `finalizeShipCompletion()`.

**Step 5: Run tests**

```bash
cd ruh-backend
bun test tests/unit/z_routes/agentShipApp.test.ts
bun run typecheck

cd ../agent-builder-ui
bun test ./app/\(platform\)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts
bun run typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add ruh-backend/src/app.ts ruh-backend/tests/unit/z_routes/agentShipApp.test.ts agent-builder-ui/app/\(platform\)/agents/create/page.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/LifecycleStepRenderer.tsx agent-builder-ui/app/\(platform\)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts
git commit -m "fix: require explicit ship confirmation"
```

---

## Task 9: Add Golden Creation QA Harness

**Files:**
- Create: `agent-builder-ui/e2e/agent-creation-golden-flow.spec.ts`
- Create: `agent-builder-ui/e2e/helpers/agentCreation.ts`
- Modify: `agent-builder-ui/playwright.config.ts` if needed
- Modify: `TESTING.md`

**Step 1: Write the E2E skeleton**

```ts
import { test, expect } from "@playwright/test";
import { createQaAgent, waitForStage, assertNoShipSideEffects } from "./helpers/agentCreation";

test("agent creation reaches review without ship side effects", async ({ page }) => {
  const agent = await createQaAgent(page, {
    name: `Golden Flow ${Date.now()}`,
    description: "A local QA agent that verifies the builder lifecycle without external integrations.",
  });

  await waitForStage(page, "think");
  await expect(page.getByText("PRD")).toBeVisible();

  await waitForStage(page, "plan");
  await expect(page.getByText("architecture.json")).toBeVisible();

  await waitForStage(page, "build");
  await expect(page.getByText("Setup complete")).toBeVisible();

  await waitForStage(page, "review");
  await assertNoShipSideEffects(agent.id);
});
```

**Step 2: Add helpers**

Helpers should:

- login using local test account
- create agent
- answer checkpoint questions
- approve Think/Plan/Build gates
- poll backend for agent state
- assert `repo_url` is empty before explicit Ship

**Step 3: Run test to verify current behavior**

```bash
cd agent-builder-ui
npx playwright test e2e/agent-creation-golden-flow.spec.ts --headed
```

Expected before all tasks are complete: fails at one of the known gaps.

**Step 4: Stabilize with backend poll helpers**

Use backend API and visible UI checks. Do not rely on fixed sleeps.

**Step 5: Add CI documentation**

Update `TESTING.md` with:

```bash
npx playwright test e2e/agent-creation-golden-flow.spec.ts
```

Mention prerequisites:

- backend on 8000
- builder on 3000
- Postgres
- sandbox image
- one LLM key

**Step 6: Commit**

```bash
git add agent-builder-ui/e2e/agent-creation-golden-flow.spec.ts agent-builder-ui/e2e/helpers/agentCreation.ts TESTING.md
git commit -m "test: add golden agent creation lifecycle e2e"
```

---

## Task 10: Update Knowledge Base and Specs

**Files:**
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/011-key-flows.md`

**Step 1: Update lifecycle docs**

Document:

- stage-aware chat
- artifact target model
- revision loop
- backend-confirmed stage advancement
- build report readiness states
- explicit Ship confirmation

**Step 2: Update API reference**

Document changes to:

- `PATCH /api/agents/:id/forge/stage`
- `POST /api/agents/:id/build`
- `GET /api/agents/:id/build/stream/:stream_id`
- `POST /api/agents/:id/ship`

**Step 3: Run KB link check**

Run the repo's existing KB link checker if available. If no checker exists:

```bash
rg "\[\[.*\]\]" docs/knowledge-base
```

Expected: no obvious broken new wikilinks.

**Step 4: Commit**

```bash
git add docs/knowledge-base/008-agent-builder-ui.md docs/knowledge-base/specs/SPEC-agent-creation-lifecycle.md docs/knowledge-base/004-api-reference.md docs/knowledge-base/011-key-flows.md
git commit -m "docs: document stage-aware builder lifecycle"
```

---

## Task 11: Final Verification

**Files:**
- No code changes unless failures reveal bugs.

**Step 1: Run backend focused tests**

```bash
cd ruh-backend
bun test tests/unit/scaffoldTemplates.test.ts tests/unit/agentSetup.test.ts tests/unit/buildReport.test.ts tests/unit/z_routes/agentLifecycleApp.test.ts tests/unit/z_routes/agentShipApp.test.ts
bun run typecheck
```

Expected: all pass.

**Step 2: Run frontend focused tests**

```bash
cd agent-builder-ui
bun test ./lib/openclaw/stage-context.test.ts ./lib/openclaw/builder-chat-suggestions.test.ts ./lib/openclaw/copilot-state.test.ts ./lib/openclaw/ag-ui/builder-agent.test.ts ./app/\(platform\)/agents/create/__tests__/copilot-components.test.tsx ./app/\(platform\)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts
bun run typecheck
```

Expected: all pass.

**Step 3: Run golden E2E**

```bash
cd agent-builder-ui
npx playwright test e2e/agent-creation-golden-flow.spec.ts
```

Expected:

- new agent reaches Review
- Build report is not blocked
- Test unlocks only after backend readiness
- `repo_url` remains empty until explicit Ship
- no marketplace listing is created before explicit Ship

**Step 4: Manual browser smoke**

Open:

```text
http://localhost:3000/agents/create
```

Verify:

- suggestions change per stage
- selecting PRD shows `Editing: prd`
- `Revise` mode sends targeted edits
- artifact updates in place
- Build report shows exact setup/build results
- Ship screen requires explicit confirmation

**Step 5: Commit final fixes**

```bash
git status --short
git add <remaining-files>
git commit -m "test: verify stage-aware builder lifecycle"
```

---

## Implementation Order

1. Stage context model
2. Stage-aware suggestions
3. Chat context UI
4. Artifact revision targeting
5. Build report persistence
6. Backend-confirmed lifecycle advancement
7. Build report UI
8. Explicit Ship confirmation
9. Golden E2E harness
10. KB/API docs
11. Final verification

This order keeps the riskiest external-effect fix before the full E2E harness, while still making the chat/copilot model coherent early enough to test manually.
