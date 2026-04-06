/**
 * E2E coverage for the current create-agent entry contract.
 *
 * The live new-agent path now starts at the forge init screen, then rewrites to
 * `/agents/create?agentId=...` once the per-agent sandbox is provisioning. The
 * default post-forge shell is Co-Pilot; the legacy Advanced branch still exists
 * behind the mode toggle and must be exercised explicitly.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const API_BASE = "http://localhost:8000";

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
  user: {
    id: "user-1",
    email: "operator@example.com",
    displayName: "Test Operator",
    role: "developer",
  },
  activeOrganization: {
    id: "org-test-001",
    name: "Test Dev Org",
    slug: "test-dev-org",
    kind: "developer",
  },
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
  appAccess: {
    admin: false,
    builder: true,
    customer: false,
  },
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
};

const ARCHITECT_READY_RESPONSE = {
  type: "ready_for_review",
  content: "I've analysed your Google Ads requirements and built a skill graph.",
  skill_graph: {
    system_name: "google-ads-optimizer",
    nodes: [
      {
        skill_id: "google-ads-audit",
        name: "Google Ads Audit",
        description: "Inspect campaign performance, search terms, and wasted spend",
        status: "generated",
        source: "custom",
        requires_env: ["GOOGLE_ADS_CUSTOMER_ID"],
        external_api: "google_ads",
      },
      {
        skill_id: "budget-pacing-report",
        name: "Budget Pacing Report",
        description: "Generate weekly pacing summaries and optimization actions",
        status: "generated",
        source: "custom",
        requires_env: [],
        external_api: null,
      },
    ],
    workflow: {
      name: "main-workflow",
      description: "google-ads-optimizer workflow",
      steps: [
        { id: "step-0", action: "execute", skill: "google-ads-audit", wait_for: [] },
        { id: "step-1", action: "execute", skill: "budget-pacing-report", wait_for: ["google-ads-audit"] },
      ],
    },
  },
  agent_metadata: {
    tone: "analytical",
    schedule_description: "Runs every weekday at 9am for the paid media team",
    primary_users: "paid media managers",
  },
  requirements: {
    schedule: "weekdays at 9am",
    required_env_vars: ["GOOGLE_ADS_CUSTOMER_ID"],
  },
};

type MockAgent = Record<string, unknown>;

let savedAgents: MockAgent[] = [];
let architectCallCount = 0;
let forgeCounter = 0;
let createdForgeSandboxId: string | null = null;
let evalTraceRequestBodies: Record<string, unknown>[] = [];
let evalJudgeRequestBodies: Record<string, unknown>[] = [];
let sharedRuntimeFallbackBodies: Record<string, unknown>[] = [];
let persistedEvalBodies: Record<string, unknown>[] = [];

function buildSseResponse(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.flatMap(({ event, data }) => [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    "",
  ]).join("\n");
}

async function mockApis(
  page: Page,
  opts?: {
    initialAgents?: MockAgent[];
  },
) {
  savedAgents = (opts?.initialAgents ?? []).map((agent) => ({ ...agent }));
  architectCallCount = 0;
  forgeCounter = 0;
  createdForgeSandboxId = null;
  evalTraceRequestBodies = [];
  evalJudgeRequestBodies = [];
  sharedRuntimeFallbackBodies = [];
  persistedEvalBodies = [];

  await page.context().addCookies([
    {
      name: "accessToken",
      value: "test-access-token",
      url: "http://localhost:3000",
    },
    {
      name: "refreshToken",
      value: "test-refresh-token",
      url: "http://localhost:3000",
    },
  ]);

  await page.route(`${API_BASE}/users/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTHENTICATED_USER),
    });
  });

  await page.route(`${API_BASE}/api/auth/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTH_SESSION),
    });
  });

  await page.route("**/api/openclaw/forge-chat-traced", async (route: Route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    evalTraceRequestBodies.push(body);

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: buildSseResponse([
        {
          event: "status",
          data: { phase: "running", message: "Running against the forge agent..." },
        },
        {
          event: "tool_start",
          data: { tool: "google-ads-audit", input: String(body.message ?? "") },
        },
        {
          event: "tool_end",
          data: { result: "Located the duplicate charge policy and refund workflow." },
        },
        {
          event: "delta",
          data: { text: "I found the duplicate charge and started the refund process." },
        },
        {
          event: "result",
          data: { content: "I found the duplicate charge and started the refund process." },
        },
      ]),
    });
  });

  await page.route("**/api/openclaw", async (route: Route) => {
    const body = JSON.parse(route.request().postData() || "{}");

    if (body.mode === "test") {
      const message = String(body.message ?? "");
      const isJudgePrompt = message.includes("You are an evaluation judge");

      if (isJudgePrompt) {
        evalJudgeRequestBodies.push(body);
      } else {
        sharedRuntimeFallbackBodies.push(body);
      }

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: buildSseResponse([
          {
            event: "status",
            data: { phase: "judging", message: "Scoring evaluation trace..." },
          },
          {
            event: "result",
            data: {
              type: "agent_response",
              content: JSON.stringify({
                passed: true,
                score: 1,
                feedback: "The forge sandbox handled the task correctly.",
                skillDiagnosis: [],
                suggestedFixes: [],
              }),
            },
          },
        ]),
      });
      return;
    }

    architectCallCount++;

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: buildSseResponse([
        {
          event: "status",
          data: { phase: "analyzing", message: "Analyzing request..." },
        },
        {
          event: "result",
          data: ARCHITECT_READY_RESPONSE,
        },
      ]),
    });
  });

  await page.route(`${API_BASE}/api/agents/create`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    forgeCounter += 1;
    const body = JSON.parse(route.request().postData() || "{}");
    const agentId = `agent-${forgeCounter}`;
    const forgeSandboxId = `sandbox-${forgeCounter}`;
    createdForgeSandboxId = forgeSandboxId;

    savedAgents.push({
      id: agentId,
      name: body.name ?? "New Agent",
      avatar: "🤖",
      description: body.description ?? "",
      skills: [],
      trigger_label: "",
      status: "forging",
      forge_sandbox_id: forgeSandboxId,
      sandbox_ids: [forgeSandboxId],
      runtime_inputs: [],
      tool_connections: [],
      triggers: [],
      skill_graph: null,
      workflow: null,
      agent_rules: [],
      workspace_memory: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agent_id: agentId,
        stream_id: `stream-${forgeCounter}`,
      }),
    });
  });

  await page.route(`${API_BASE}/api/agents/*/forge/stream/*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: [
        "event: log",
        `data: ${JSON.stringify({ message: "Creating your agent..." })}`,
        "",
        "event: log",
        `data: ${JSON.stringify({ message: "Starting container..." })}`,
        "",
        "event: result",
        `data: ${JSON.stringify({ sandbox_id: `sandbox-${forgeCounter}` })}`,
        "",
        "event: approved",
        "data: {}",
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n"),
    });
  });

  await page.route(`${API_BASE}/api/agents/*/forge`, async (route: Route) => {
    const id = route.request().url().split("/api/agents/")[1].split("/forge")[0];
    const agent = savedAgents.find((candidate) => candidate.id === id);

    if (!agent || !agent.forge_sandbox_id) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forge sandbox not found" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        forge_sandbox_id: agent.forge_sandbox_id,
        status: "ready",
        sandbox: {
          sandbox_id: agent.forge_sandbox_id,
          sandbox_name: `${agent.name ?? "agent"}-forge`,
          gateway_port: 18789,
          vnc_port: 6080,
        },
      }),
    });
  });

  await page.route(`${API_BASE}/api/agents`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(savedAgents),
      });
      return;
    }

    await route.fallback();
  });

  await page.route(`${API_BASE}/api/agents/*`, async (route: Route) => {
    const url = route.request().url();

    if (
      url.includes("/config") ||
      url.includes("/sandbox") ||
      url.includes("/workspace-memory") ||
      url.includes("/forge")
    ) {
      await route.fallback();
      return;
    }

    if (route.request().method() === "GET") {
      const id = url.split("/api/agents/")[1];
      const agent = savedAgents.find((candidate) => candidate.id === id);
      await route.fulfill({
        status: agent ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(agent ?? { error: "Not found" }),
      });
      return;
    }

    if (route.request().method() === "PATCH") {
      const id = url.split("/api/agents/")[1];
      const body = JSON.parse(route.request().postData() || "{}");
      const idx = savedAgents.findIndex((candidate) => candidate.id === id);

      if (idx >= 0) {
        savedAgents[idx] = {
          ...savedAgents[idx],
          ...body,
          updated_at: new Date().toISOString(),
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedAgents[idx]),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Not found" }),
        });
      }
      return;
    }

    await route.fallback();
  });

  await page.route(`${API_BASE}/api/agents/*/config`, async (route: Route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    const url = route.request().url();
    const id = url.split("/api/agents/")[1].split("/config")[0];
    const body = JSON.parse(route.request().postData() || "{}");
    const idx = savedAgents.findIndex((candidate) => candidate.id === id);

    if (idx >= 0) {
      if (body.skillGraph !== undefined) (savedAgents[idx] as Record<string, unknown>).skill_graph = body.skillGraph;
      if (body.workflow !== undefined) (savedAgents[idx] as Record<string, unknown>).workflow = body.workflow;
      if (body.agentRules !== undefined) (savedAgents[idx] as Record<string, unknown>).agent_rules = body.agentRules;
      if (body.runtimeInputs !== undefined) (savedAgents[idx] as Record<string, unknown>).runtime_inputs = body.runtimeInputs;
      if (body.toolConnections !== undefined) (savedAgents[idx] as Record<string, unknown>).tool_connections = body.toolConnections;
      if (body.triggers !== undefined) (savedAgents[idx] as Record<string, unknown>).triggers = body.triggers;
      (savedAgents[idx] as Record<string, unknown>).updated_at = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(savedAgents[idx]),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    }
  });

  await page.route(`${API_BASE}/api/agents/*/eval-results`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = route.request().url();
    const agentId = url.split("/api/agents/")[1].split("/eval-results")[0];
    const body = JSON.parse(route.request().postData() || "{}");
    persistedEvalBodies.push(body);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: `eval-${persistedEvalBodies.length}`,
        agent_id: agentId,
        created_at: new Date().toISOString(),
        ...body,
      }),
    });
  });

  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/api/skills`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skill_id: "google-ads-audit",
          name: "Google Ads Audit",
          description: "Inspect campaign performance, search terms, and wasted spend",
          tags: ["google-ads", "ads"],
          skill_md: "# Google Ads Audit",
        },
        {
          skill_id: "budget-pacing-report",
          name: "Budget Pacing Report",
          description: "Generate weekly pacing summaries and optimization actions",
          tags: ["reporting", "budget"],
          skill_md: "# Budget Pacing Report",
        },
      ]),
    });
  });
}

async function startNewAgent(
  page: Page,
  opts?: {
    name?: string;
    description?: string;
  },
) {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("e.g. Google Ads Manager").fill(opts?.name ?? "Google Ads Manager");
  if (opts?.description) {
    await page
      .getByPlaceholder(/Describe their role like you'd explain it to a teammate/i)
      .fill(opts.description);
  }

  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByText("Improve Agent")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
}

async function sendBuilderMessage(page: Page, text: string) {
  // The chat textarea placeholder varies by stage — use the visible textarea in the chat input area
  const textarea = page.locator("textarea:visible").first();
  await textarea.waitFor({ state: "visible", timeout: 10_000 });
  await textarea.fill(text);
  const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
  await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
  await sendButton.click();
  await expect(textarea).toHaveValue("", { timeout: 8_000 });
}

test.describe("Create Agent — current entry contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  test("blank /agents/create starts at the forge init screen and requires a name", async ({ page }) => {
    await mockApis(page);
    await page.goto("/agents/create");

    await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
    const bringToLife = page.getByRole("button", { name: /Bring to life/i });
    await expect(bringToLife).toBeDisabled();

    await page.getByPlaceholder("e.g. Google Ads Manager").fill("Google Ads Manager");
    await expect(bringToLife).toBeEnabled();
    await expect(page.getByRole("button", { name: /Guided/i })).toHaveCount(0);
  });

  test("submitting the init form rewrites to ?agentId and lands in Co-Pilot by default", async ({ page }) => {
    await mockApis(page);
    await startNewAgent(page, { name: "Google Ads Manager" });

    // LifecycleStepRenderer shows the Think stage with the discovery step
    await expect(page.getByText("Ready to start")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Guided/i })).toHaveCount(0);
  });

  test("post-provision mode toggle exposes only Co-Pilot and Advanced", async ({ page }) => {
    await mockApis(page);
    await startNewAgent(page, { name: "API Research Agent" });

    await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Advanced/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Guided/i })).toHaveCount(0);
  });

  test("Advanced mode still supports the legacy review handoff after architect output", async ({ page }) => {
    await mockApis(page);
    await startNewAgent(page, { name: "API Research Agent" });

    await page.getByRole("button", { name: /Advanced/i }).click();

    // Send a builder message — the architect response triggers immediate navigation to review,
    // so we send inline and wait for the review view instead of checking textarea clear.
    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill(
      "Build me a Google Ads optimizer that audits campaigns and sends pacing reports.",
    );
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
    await sendButton.click();

    // The ready_for_review architect response auto-navigates to review
    await expect(page.getByText("Review your agent")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Google Ads Audit").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Budget Pacing Report").first()).toBeVisible({ timeout: 5_000 });
  });

  test("Improve Agent bypasses forge init and opens directly in the builder shell", async ({ page }) => {
    await mockApis(page, {
      initialAgents: [
        {
          id: "agent-existing",
          name: "Google Ads Optimizer",
          avatar: "🤖",
          description: "Optimizes bids and pacing for paid media managers.",
          skills: ["Google Ads Audit", "Budget Pacing Report"],
          status: "active",
          forge_sandbox_id: "sandbox-existing",
          sandbox_ids: ["sandbox-existing"],
          tool_connections: [],
          triggers: [],
          skill_graph: ARCHITECT_READY_RESPONSE.skill_graph.nodes,
          workflow: ARCHITECT_READY_RESPONSE.skill_graph.workflow,
          agent_rules: ["Run every weekday at 9am"],
          workspace_memory: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    await page.goto("/agents/create?agentId=agent-existing");

    await expect(page.getByText("Who are you bringing to life?")).toHaveCount(0);
    await expect(page.getByText("Improve Agent")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
    // In copilot mode the agent name appears in headings (h2 in header + h3 in chat)
    await expect(page.getByRole("heading", { name: "Google Ads Optimizer" }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("create → test keeps live eval execution pinned to the created forge sandbox", async ({ page }) => {
    await mockApis(page);
    await startNewAgent(page, {
      name: "Google Ads Manager",
      description: "Audits campaigns and helps with billing issues.",
    });

    await expect.poll(
      async () => page.evaluate(() => {
        return (window as unknown as { __coPilotStore?: { getState?: () => { agentSandboxId?: string | null } } })
          .__coPilotStore?.getState?.().agentSandboxId ?? null;
      }),
      { timeout: 15_000 },
    ).toBe(createdForgeSandboxId);

    expect(createdForgeSandboxId).toBeTruthy();

    await page.evaluate(({ evalTask }) => {
      const store = (window as unknown as {
        __coPilotStore?: {
          getState?: () => {
            setThinkStatus: (status: string) => void;
            setPlanStatus: (status: string) => void;
            setBuildStatus: (status: string) => void;
            setEvalStatus: (status: string) => void;
            setEvalTasks: (tasks: Array<Record<string, unknown>>) => void;
            setDevStage: (stage: string) => void;
          };
        };
      }).__coPilotStore;

      const state = store?.getState?.();
      state?.setThinkStatus("approved");
      state?.setPlanStatus("approved");
      state?.setBuildStatus("done");
      state?.setEvalTasks([evalTask]);
      state?.setEvalStatus("ready");
      state?.setDevStage("test");
    }, {
      evalTask: {
        id: "eval-live-1",
        title: "Handle duplicate billing charge",
        input: "Hi, I was charged twice for my subscription last month. Can you help?",
        expectedBehavior: "Agent audits the billing issue, identifies the duplicate charge, and starts the refund process.",
        status: "pending",
      },
    });

    await expect(page.getByText("Agent Evaluation")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Live$/ }).click();
    await page.getByRole("button", { name: /Run All Tests/i }).click();

    await expect(page.getByRole("button", { name: /Approve Tests/i })).toBeVisible({ timeout: 15_000 });

    expect(evalTraceRequestBodies).toHaveLength(1);
    expect(evalTraceRequestBodies[0]?.sandbox_id).toBe(createdForgeSandboxId);

    // Eval persistence fires asynchronously after the eval run completes — poll for it
    await expect.poll(
      () => persistedEvalBodies.length,
      { timeout: 5_000, message: "Expected eval results to be persisted" },
    ).toBeGreaterThanOrEqual(1);
    expect(persistedEvalBodies[0]?.sandbox_id).toBe(createdForgeSandboxId);

    expect(evalJudgeRequestBodies.length).toBeGreaterThan(0);
    expect(sharedRuntimeFallbackBodies).toHaveLength(0);
  });
});
