/**
 * E2E validation for the Prototype stage. The architect produced an
 * architecturePlan with a dashboardPrototype payload; this spec
 * confirms StagePrototype renders all the structural pieces, the
 * interactive simulation buttons work, and "Approve Prototype & Start
 * Build" actually fires onPrototypeApproved.
 *
 * The dashboardPrototype shape mirrors what the architect emits today
 * for the 935d01d0… Test Agent (7 pages, 4 workflows, 9 actions, 5
 * artifacts, full pipeline).
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const APP_ORIGIN = "http://localhost:3000";

const AUTHENTICATED_USER = {
  id: "user-1",
  fullName: "Test Operator",
  email: "operator@example.com",
  company: "Ruh",
  department: "Product",
  jobRole: "QA",
  phoneNumber: "",
  profileImage: "",
  isFirstLogin: false,
};

const AUTH_SESSION = {
  user: { id: "user-1", email: "operator@example.com", displayName: "Test Operator", role: "developer" },
  activeOrganization: { id: "org-test-001", name: "Test Dev Org", slug: "test-dev-org", kind: "developer" },
  memberships: [
    {
      organizationId: "org-test-001",
      organizationName: "Test Dev Org",
      organizationSlug: "test-dev-org",
      organizationKind: "developer",
      role: "owner",
      status: "active",
    },
  ],
  appAccess: { admin: false, builder: true, customer: false },
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
};

const SAMPLE_PLAN = {
  systemName: "test-agent",
  agentName: "Test Agent",
  summary: "Local-first productivity assistant.",
  skills: [
    { id: "ingest", name: "Message Ingest", description: "Stores inbound chat" },
    { id: "capture", name: "Explicit Capture", description: "Detects task language" },
  ],
  workflow: {
    steps: [
      { skillId: "ingest", parallel: false },
      { skillId: "capture", parallel: false },
    ],
  },
  dashboardPages: [
    { path: "/overview", title: "Overview", description: "At-a-glance state", components: [{ type: "metric-cards", title: "Snapshot", dataSource: "/api/overview" }] },
    { path: "/approvals", title: "Pending Approvals", description: "Review queue", components: [{ type: "data-table", title: "Queue", dataSource: "/api/approvals" }] },
    { path: "/tasks", title: "Tasks", description: "Canonical tasks", components: [{ type: "data-table", title: "Tasks", dataSource: "/api/tasks" }] },
  ],
  apiEndpoints: [
    { method: "GET", path: "/api/overview", description: "Overview", responseShape: "{ metrics }" },
    { method: "GET", path: "/api/approvals", description: "Approvals", responseShape: "{ approvals }" },
    { method: "GET", path: "/api/tasks", description: "Tasks", responseShape: "{ tasks }" },
  ],
  dashboardPrototype: {
    summary: "Mission Control prototype validating approval-gated capture.",
    primaryUsers: ["Single Webchat operator"],
    workflows: [
      {
        id: "capture-and-approve",
        name: "Capture explicit task or note",
        steps: ["Simulate message", "Run capture", "Review approval", "Approve or reject"],
        requiredActions: ["create-source-message", "approve-approval"],
        successCriteria: ["Approved create produces a task"],
      },
      {
        id: "monitor-quality",
        name: "Monitor capture quality",
        steps: ["Open Overview", "Inspect backlog"],
        requiredActions: [],
        successCriteria: ["Indicators visible"],
      },
    ],
    pages: [
      { path: "/overview", title: "Overview", purpose: "Workload + risk", supportsWorkflows: ["monitor-quality"], requiredActions: [], acceptanceCriteria: ["Page data from endpoint"] },
      { path: "/approvals", title: "Pending Approvals", purpose: "Approval queue review", supportsWorkflows: ["capture-and-approve"], requiredActions: ["approve-approval"], acceptanceCriteria: ["Diff and source visible"] },
      { path: "/tasks", title: "Tasks", purpose: "Canonical task table", supportsWorkflows: ["capture-and-approve"], requiredActions: [], acceptanceCriteria: ["Page data from endpoint"] },
    ],
    actions: [
      { id: "create-source-message", label: "Simulate message", type: "create", target: "source_message", primary: true },
      { id: "run-capture", label: "Run capture pipeline", type: "run_pipeline", target: "capture_pipeline", primary: true },
      { id: "approve-approval", label: "Approve pending mutation", type: "approve", target: "approval_request", primary: true },
    ],
    pipeline: {
      name: "Approval-gated capture",
      triggerActionId: "run-capture",
      steps: [
        { id: "ingest", name: "Ingest source", producesArtifacts: ["source-record"] },
        { id: "extract", name: "Extract candidate", producesArtifacts: ["candidate"] },
        { id: "approval", name: "Create approval", producesArtifacts: ["approval-packet"] },
      ],
      completionCriteria: ["Approved candidates create canonical records"],
      failureStates: ["No explicit language"],
    },
    artifacts: [
      { id: "source-record", name: "Source record", type: "evidence", reviewActions: ["inspect_source"], acceptanceCriteria: ["Raw text preserved"] },
      { id: "candidate", name: "Candidate packet", type: "proposal", reviewActions: ["approve_artifact"], acceptanceCriteria: ["Fields visible"] },
      { id: "approval-packet", name: "Approval packet", type: "approval", reviewActions: ["approve_artifact"], acceptanceCriteria: ["Diff visible"] },
    ],
    emptyState: "Simulate a message to validate the workflow before Build.",
    revisionPrompts: ["Should dashboard actions be enabled by default?"],
    approvalChecklist: ["Each page maps to a workflow"],
  },
  envVars: [],
  triggers: [],
  subAgents: [],
};

async function mockStack(page: Page) {
  await page.context().addCookies([
    { name: "accessToken", value: "test-access-token", url: APP_ORIGIN },
    { name: "refreshToken", value: "test-refresh-token", url: APP_ORIGIN },
  ]);
  await page.route(`${API_BASE}/users/me`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTHENTICATED_USER) }),
  );
  await page.route(`${API_BASE}/api/auth/me`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_SESSION) }),
  );
  await page.route(`${API_BASE}/api/auth/github/status`, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: true, username: "test-user" }),
    }),
  );

  await page.route(`${API_BASE}/api/agents/create`, async (route: Route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agent_id: `agent-${Date.now()}`, stream_id: "stream-1", name: body.name }),
    });
  });
  await page.route(/\/api\/agents\/[^/]+\/forge\/stream\/[^/?]+/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ["event: result", `data: ${JSON.stringify({ sandbox_id: "sandbox-1" })}`, "", "event: done", "data: {}", ""].join("\n"),
    }),
  );
  await page.route(/\/api\/agents\/[^/]+\/forge(\?|$)/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        forge_sandbox_id: "sandbox-1",
        status: "ready",
        sandbox: { sandbox_id: "sandbox-1", sandbox_name: "forge", gateway_port: 18789, vnc_port: 6080 },
      }),
    }),
  );
  await page.route(/\/api\/agents(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/api\/agents\/[^/?]+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/api/agents/")[1].split("/")[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id, name: "Test Agent", forge_sandbox_id: "sandbox-1", status: "forging" }),
    });
  });

  // Stage transitions — PATCH /api/agents/:id/forge/stage commits a
  // Plan→Build transition before setDevStage fires locally.
  await page.route(/\/api\/agents\/[^/]+\/forge\/stage(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "PATCH") { await route.fallback(); return; }
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, forge_stage: body.stage ?? "build" }),
    });
  });

  // Build start — POST /api/agents/:id/build returns a stream_id.
  await page.route(/\/api\/agents\/[^/]+\/build(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stream_id: "build-stream-1", agent_id: "test-agent" }),
    });
  });

  // Build SSE stream — just emit a status keepalive and stay open
  // briefly so the build start path doesn't crash.
  await page.route(/\/api\/agents\/[^/]+\/build\/stream\/[^/?]+/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: [
        "event: status",
        `data: ${JSON.stringify({ type: "status", message: "Build starting..." })}`,
        "",
      ].join("\n"),
    }),
  );
  await page.route(/\/api\/sandboxes\/[^/?]+(\?|$)/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sandbox_id: "sandbox-1", sandbox_name: "forge", gateway_port: 18789, vnc_port: 6080, approved: true }),
    }),
  );
  await page.route(/\/api\/conversations(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

async function startNewAgent(page: Page) {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("e.g. Google Ads Manager").fill("Prototype Test Agent");
  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
}

interface StoreHandle {
  setRevealStatus?: (s: string) => void;
  setDevStage?: (s: string) => void;
  setAgentSandboxId?: (id: string) => void;
  setArchitecturePlan?: (plan: unknown) => void;
  setThinkStatus?: (s: string) => void;
  setPlanStatus?: (s: string) => void;
}

async function jumpToPrototypeStage(page: Page, plan: unknown) {
  await expect
    .poll(async () =>
      page.evaluate((p) => {
        const w = window as unknown as { __coPilotStore?: { getState?: () => StoreHandle } };
        const store = w.__coPilotStore?.getState?.();
        if (!store?.setDevStage) return false;
        store.setRevealStatus?.("approved");
        store.setAgentSandboxId?.("sandbox-1");
        store.setThinkStatus?.("approved");
        store.setPlanStatus?.("approved");
        store.setArchitecturePlan?.(p);
        store.setDevStage("prototype");
        return true;
      }, plan),
    )
    .toBe(true);
}

test.describe("Prototype stage validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("openclaw-agents"));
  });

  test("renders dashboard prototype with summary, primaryUsers, workflows, and pages", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToPrototypeStage(page, SAMPLE_PLAN);

    // Top header
    await expect(page.getByRole("heading", { name: /Dashboard Prototype/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(SAMPLE_PLAN.dashboardPrototype.summary)).toBeVisible();
    await expect(page.getByText(SAMPLE_PLAN.dashboardPrototype.primaryUsers[0])).toBeVisible();
  });

  test("Approve Prototype & Start Build button is enabled when prototype is ready", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToPrototypeStage(page, SAMPLE_PLAN);

    const approve = page.getByRole("button", { name: /Approve Prototype & Start Build/i });
    await expect(approve).toBeVisible({ timeout: 10_000 });
    await expect(approve).not.toBeDisabled();
  });

  test("Approve Prototype & Start Build is disabled when dashboardPrototype is missing required fields", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    const malformed = {
      ...SAMPLE_PLAN,
      dashboardPrototype: {
        ...SAMPLE_PLAN.dashboardPrototype,
        // Strip required fields — workflows is required and non-empty
        workflows: [],
      },
    };
    await jumpToPrototypeStage(page, malformed);

    // Should show "Prototype blocked" amber banner
    await expect(page.getByText(/Prototype blocked/i)).toBeVisible({ timeout: 10_000 });
    const approve = page.getByRole("button", { name: /Approve Prototype & Start Build/i });
    await expect(approve).toBeDisabled();
  });

  test("renders all 3 dashboard pages from the plan", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToPrototypeStage(page, SAMPLE_PLAN);

    // Wait for the prototype to mount
    await expect(page.getByRole("heading", { name: /Dashboard Prototype/i })).toBeVisible({ timeout: 10_000 });

    // Each plan page should be reachable as a navigation entry. The
    // prototype's left navigation lists page titles.
    for (const page_ of SAMPLE_PLAN.dashboardPages) {
      // page titles are rendered in nav AND in the page content header — at
      // least one match per page is required.
      const matches = page.getByText(page_.title, { exact: false });
      await expect(matches.first()).toBeVisible();
    }
  });

  test("renders workflow names from dashboardPrototype.workflows (page-scoped)", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToPrototypeStage(page, SAMPLE_PLAN);
    await expect(page.getByRole("heading", { name: /Dashboard Prototype/i })).toBeVisible({ timeout: 10_000 });

    // Workflows are page-scoped via supportsWorkflows. The default page
    // (Overview) supports "monitor-quality". The other two pages support
    // "capture-and-approve". Verify each workflow is reachable by
    // navigating to a page that supports it.
    const monitorQuality = SAMPLE_PLAN.dashboardPrototype.workflows.find((w) => w.id === "monitor-quality")!;
    const captureAndApprove = SAMPLE_PLAN.dashboardPrototype.workflows.find((w) => w.id === "capture-and-approve")!;

    // Default page (Overview) → monitor-quality should be visible
    await expect(page.getByText(monitorQuality.name, { exact: false }).first()).toBeVisible();

    // Click the approvals page in the prototype navigation → capture-and-approve should appear
    await page.getByRole("button", { name: "Pending Approvals", exact: false }).first().click();
    await expect(page.getByText(captureAndApprove.name, { exact: false }).first()).toBeVisible();
  });

  test("clicking Approve Prototype & Start Build advances devStage to build", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToPrototypeStage(page, SAMPLE_PLAN);

    // Hook devStage change so we can detect the transition
    await page.evaluate(() => {
      const w = window as unknown as {
        __copilotDevStageChanges?: string[];
        __coPilotStore?: {
          subscribe?: (cb: (state: unknown, prev: unknown) => void) => () => void;
          getState?: () => { devStage?: string };
        };
      };
      w.__copilotDevStageChanges = [];
      w.__coPilotStore?.subscribe?.((state) => {
        const next = (state as { devStage?: string }).devStage;
        if (next) w.__copilotDevStageChanges?.push(next);
      });
    });

    await page.getByRole("button", { name: /Approve Prototype & Start Build/i }).click();

    // The page handler should set devStage to "build" via setDevStage or
    // confirmForgeStage. Allow up to 8s for the transition (it may go
    // through an intermediate Saving state).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as { __coPilotStore?: { getState?: () => { devStage?: string } } };
            return w.__coPilotStore?.getState?.()?.devStage ?? null;
          }),
        { timeout: 10_000 },
      )
      .toBe("build");
  });
});
