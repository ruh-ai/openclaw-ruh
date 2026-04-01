/**
 * E2E tests for the full Create Agent workflow.
 *
 * Covers: Chat → Review → Configure (3 steps) → Save
 *
 * Mocks all API calls (architect bridge, agents CRUD) so no real backend is needed.
 * The Next.js dev server must already be running on port 3001.
 */

import { test, expect, Page, Route } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Mock architect response payloads ─────────────────────────────────────────

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

const ARCHITECT_CLARIFICATION = {
  type: "clarification",
  content: "What kind of agent would you like to build? Tell me about the tasks it should handle.",
  context: "I'd love to help you build an agent! Could you describe what tasks you need it to handle?",
  questions: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let savedAgents: Record<string, unknown>[] = [];
let architectCallCount = 0;
let sandboxCounter = 0;

/** Register Playwright route interceptors for all APIs needed by the create page. */
async function mockApis(
  page: Page,
  opts?: {
    /** Number of clarification responses before returning ready_for_review */
    clarificationRounds?: number;
    /** Preseeded saved agents returned by GET /api/agents */
    initialAgents?: Record<string, unknown>[];
  },
) {
  savedAgents = (opts?.initialAgents ?? []).map((agent) => ({ ...agent }));
  architectCallCount = 0;
  sandboxCounter = 0;
  const clarificationRounds = opts?.clarificationRounds ?? 0;

  await page.context().addCookies([
    {
      name: "accessToken",
      value: "test-access-token",
      url: "http://localhost:3001",
    },
    {
      name: "refreshToken",
      value: "test-refresh-token",
      url: "http://localhost:3001",
    },
  ]);

  await page.route(`${API_BASE}/users/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTHENTICATED_USER),
    });
  });

  // Architect bridge — POST /api/openclaw
  // Returns SSE stream with ArchitectResponse
  await page.route("**/api/openclaw", async (route: Route) => {
    architectCallCount++;
    const isReady = architectCallCount > clarificationRounds;

    const response = isReady
      ? ARCHITECT_READY_RESPONSE
      : ARCHITECT_CLARIFICATION;

    // The bridge returns an SSE stream where the final event is the full response
    const sseBody = [
      "event: status",
      `data: ${JSON.stringify({ phase: "analyzing", message: "Analyzing request..." })}`,
      "",
      "event: result",
      `data: ${JSON.stringify(response)}`,
      "",
    ].join("\n");

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: sseBody,
    });
  });

  // List agents — GET /api/agents
  await page.route(`${API_BASE}/api/agents`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(savedAgents),
      });
    } else if (route.request().method() === "POST") {
      // Create agent
      const body = JSON.parse(route.request().postData() || "{}");
      const agent = {
        id: `agent-${Date.now()}`,
        name: body.name || "New Agent",
        avatar: body.avatar || "🤖",
        description: body.description || "",
        skills: body.skills || [],
        trigger_label: body.triggerLabel || "",
        status: body.status || "draft",
        sandbox_ids: [],
        runtime_inputs: body.runtimeInputs || [],
        tool_connections: body.toolConnections || [],
        triggers: body.triggers || [],
        skill_graph: body.skillGraph || null,
        workflow: body.workflow || null,
        agent_rules: body.agentRules || [],
        workspace_memory: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      savedAgents.push(agent);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(agent),
      });
    } else {
      await route.continue();
    }
  });

  // Individual agent — GET/PATCH/DELETE /api/agents/:id
  await page.route(`${API_BASE}/api/agents/*`, async (route: Route) => {
    const url = route.request().url();

    // Skip config and sandbox sub-routes
    if (url.includes("/config") || url.includes("/sandbox") || url.includes("/workspace-memory")) {
      await route.fallback();
      return;
    }

    if (route.request().method() === "GET") {
      const id = url.split("/api/agents/")[1];
      const agent = savedAgents.find((a) => (a as { id: string }).id === id);
      if (agent) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(agent),
        });
      } else {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      }
    } else if (route.request().method() === "PATCH") {
      const id = url.split("/api/agents/")[1];
      const body = JSON.parse(route.request().postData() || "{}");
      const idx = savedAgents.findIndex((a) => (a as { id: string }).id === id);
      if (idx >= 0) {
        savedAgents[idx] = { ...savedAgents[idx], ...body, updated_at: new Date().toISOString() };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedAgents[idx]),
        });
      } else {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      }
    } else {
      await route.continue();
    }
  });

  // Agent config patch — PATCH /api/agents/:id/config
  await page.route(`${API_BASE}/api/agents/*/config`, async (route: Route) => {
    if (route.request().method() === "PATCH") {
      const url = route.request().url();
      const id = url.split("/api/agents/")[1].split("/config")[0];
      const body = JSON.parse(route.request().postData() || "{}");
      const idx = savedAgents.findIndex((a) => (a as { id: string }).id === id);
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
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      }
    } else {
      await route.continue();
    }
  });

  await page.route(`${API_BASE}/api/agents/*/sandbox`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const url = route.request().url();
    const id = url.split("/api/agents/")[1].split("/sandbox")[0];
    const body = JSON.parse(route.request().postData() || "{}");
    const idx = savedAgents.findIndex((a) => (a as { id: string }).id === id);

    if (idx < 0) {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      return;
    }

    const sandboxIds = [...(((savedAgents[idx] as { sandbox_ids?: string[] }).sandbox_ids) ?? []), body.sandbox_id];
    savedAgents[idx] = {
      ...savedAgents[idx],
      sandbox_ids: sandboxIds,
      updated_at: new Date().toISOString(),
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(savedAgents[idx]),
    });
  });

  // Sandboxes list (needed by some shared components)
  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`${API_BASE}/api/sandboxes/create`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    sandboxCounter += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stream_id: `stream-${sandboxCounter}` }),
    });
  });

  await page.route(`${API_BASE}/api/sandboxes/*/status`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "running",
        container_running: true,
      }),
    });
  });

  await page.route(`${API_BASE}/api/sandboxes/stream/*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: [
        "event: log",
        `data: ${JSON.stringify({ message: "Provisioning sandbox..." })}`,
        "",
        "event: result",
        `data: ${JSON.stringify({ sandbox_id: `sandbox-${sandboxCounter}` })}`,
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

  await page.route(`${API_BASE}/api/sandboxes/*/configure-agent`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        applied: true,
        detail: null,
        steps: [{ kind: "soul", target: "SOUL.md", ok: true, message: "SOUL applied" }],
      }),
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

/** Navigate to the create agent page and wait for it to be ready. */
async function goToCreatePage(page: Page) {
  await page.goto("/agents/create");
  // Wait for the page header
  await expect(page.getByText("Create New Agent")).toBeVisible({ timeout: 15_000 });
}

/** Type a message in the builder chat and submit it. */
async function sendBuilderMessage(page: Page, text: string) {
  const ta = page.locator('textarea[placeholder="Describe your agent idea…"]:visible');
  await ta.waitFor({ state: "visible", timeout: 10_000 });
  await ta.click();
  await ta.fill(text);
  const sendBtn = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
  await expect(sendBtn).not.toBeDisabled({ timeout: 5_000 });
  await sendBtn.click();
  // Wait for message to be sent (textarea clears)
  await expect(ta).toHaveValue("", { timeout: 8_000 });
}

/** Navigate from chat to review by clicking the "Proceed to Review" button. */
async function proceedToReview(page: Page) {
  const reviewBtn = page.getByRole("button", { name: /Proceed to Review/i });
  await reviewBtn.waitFor({ state: "visible", timeout: 10_000 });
  await reviewBtn.click();
  // Wait for the review page header
  await expect(page.getByText("Review your agent")).toBeVisible({ timeout: 10_000 });
}

/** Navigate from review to configure by clicking Confirm. */
async function confirmReview(page: Page) {
  const confirmBtn = page.getByRole("button", { name: /Confirm/i });
  await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
  await confirmBtn.click();
  // Wait for the configure page (stepper visible)
  await expect(page.getByText("Connect Tools")).toBeVisible({ timeout: 10_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Create Agent — Full Workflow", () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Chat view renders and accepts messages
  // ───────────────────────────────────────────────────────────────────────────
  test("renders chat view with builder mode header", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    // Header shows "Create New Agent"
    await expect(page.getByText("Create New Agent")).toBeVisible();

    // Chat textarea is present
    await expect(page.locator("textarea")).toBeVisible({ timeout: 10_000 });

    // Back button navigates to agents list
    await expect(page.getByLabel("Back to agents")).toBeVisible();
  });

  test("locks runtime tabs until purpose metadata generates skills", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    await expect(terminalTab).toBeDisabled();
    await expect(page.getByTestId("copilot-config-stepper")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("computer-tab-config")).toHaveAttribute("data-active", "true");

    await page.getByPlaceholder("e.g., Google Ads Manager").fill("Google Ads Optimizer");
    await page.getByPlaceholder(/Manages Google Ads campaigns/i).fill(
      "Audits campaigns and sends pacing reports for paid media managers.",
    );

    await expect(page.getByText("Skills ready")).toBeVisible({ timeout: 15_000 });
    await expect(terminalTab).toBeEnabled({ timeout: 5_000 });

    await terminalTab.click();
    await expect(page.getByText("No commands run yet")).toBeVisible({ timeout: 5_000 });
  });

  test("opens Improve Agent in copilot mode and returns to the list after save/hot-push", async ({ page }) => {
    await mockApis(page, {
      initialAgents: [
        {
          id: "agent-existing",
          name: "Google Ads Optimizer",
          avatar: "🤖",
          description: "Optimizes bids and pacing for paid media managers.",
          skills: ["Google Ads Audit", "Budget Pacing Report"],
          trigger_label: "Every weekday at 9am",
          status: "active",
          sandbox_ids: ["sandbox-1"],
          tool_connections: [
            {
              toolId: "google-ads",
              name: "Google Ads",
              description: "Primary ads connector",
              status: "configured",
              authKind: "oauth",
              connectorType: "mcp",
              configSummary: ["Connected via OAuth"],
            },
          ],
          triggers: [
            {
              id: "weekday-9am",
              title: "Every weekday at 9am",
              kind: "schedule",
              status: "supported",
              description: "Run on weekdays",
              schedule: "0 9 * * 1-5",
            },
          ],
          skill_graph: ARCHITECT_READY_RESPONSE.skill_graph.nodes,
          workflow: ARCHITECT_READY_RESPONSE.skill_graph.workflow,
          agent_rules: ["Run every weekday at 9am"],
          improvements: [],
          workspace_memory: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    await page.goto("/agents");
    await expect(page.getByText("Google Ads Optimizer")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Build$/i }).click();

    await expect(page).toHaveURL(/\/agents\/create\?agentId=agent-existing/);
    await expect(page.getByText("Improve Agent")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("copilot-config-stepper")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("e.g., Google Ads Manager")).toHaveValue("Google Ads Optimizer");
    await expect(
      page.getByPlaceholder(/Manages Google Ads campaigns/i),
    ).toHaveValue("Optimizes bids and pacing for paid media managers.");

    const deployButton = page.getByRole("button", { name: /Deploy Agent/i }).first();
    await expect(deployButton).toBeEnabled({ timeout: 10_000 });
    await deployButton.click();

    await page.waitForURL(/\/agents$/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/agents\/agent-existing\/deploy/);
    await expect(page.getByText("Google Ads Optimizer")).toBeVisible();
  });

  test("shows live agent info and draft save status before review", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");

    await expect.poll(() => savedAgents.length).toBe(1);
    await expect(page.getByTestId("builder-agent-name")).toHaveText("google-ads-optimizer", { timeout: 15_000 });
    await expect(page.getByTestId("builder-draft-status")).toHaveText("Draft saved", { timeout: 15_000 });
    expect(savedAgents[0]).toMatchObject({
      name: "google-ads-optimizer",
      status: "draft",
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Sending a message to the architect
  // ───────────────────────────────────────────────────────────────────────────
  test("sends a message and receives architect response", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer that audits campaigns and sends pacing reports");

    // The architect response should show skill graph ready message
    await expect(
      page.getByText(/skill graph/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Full flow — Chat → Review → Configure → Save
  // ───────────────────────────────────────────────────────────────────────────
  test("completes full create agent workflow end to end", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    // Step 1: Chat with architect
    await sendBuilderMessage(page, "Build me a Google Ads optimizer");

    // Wait for skill graph response
    await expect(
      page.getByText(/skill graph/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Step 2: Open the Config-tab Co-Pilot flow
    await page.getByRole("button", { name: /Proceed to Review/i }).click();

    const configFlow = page.getByTestId("copilot-config-stepper");
    await expect(configFlow).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("computer-tab-config")).toHaveAttribute("data-active", "true");
    await expect(configFlow.getByRole("heading", { name: "Choose Skills" })).toBeVisible({ timeout: 5_000 });

    // Step 3: Move through the in-config builder steps with the architect defaults.
    await configFlow.getByRole("button", { name: /^Next$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Connect Tools" })).toBeVisible({ timeout: 5_000 });

    await configFlow.getByRole("button", { name: /^Next$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Runtime Inputs" })).toBeVisible({ timeout: 5_000 });

    await expect(configFlow.getByText("1 required runtime input still missing")).toBeVisible({ timeout: 5_000 });

    await configFlow.getByRole("button", { name: /^Next$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Agent Triggers" })).toBeVisible({ timeout: 5_000 });

    await configFlow.getByRole("button", { name: /^Next$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Review Your Agent" })).toBeVisible({ timeout: 5_000 });

    // Step 4: Review should expose the same readiness-grade contract as deploy.
    await expect(configFlow.getByText("Deploy readiness")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Action needed before deploy")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Google Ads")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Configured")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Google Ads Customer ID")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Missing value")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Weekday schedule")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Supported schedule")).toBeVisible({ timeout: 5_000 });

    // Step 5: Review should expose an embedded completion CTA, not a dead "Next".
    await expect(configFlow.getByRole("button", { name: /^Next$/i })).toHaveCount(0);
    const embeddedDeployButton = configFlow.getByRole("button", { name: /Deploy Agent/i });
    await expect(embeddedDeployButton).toBeDisabled({ timeout: 5_000 });

    await configFlow.getByRole("button", { name: /^Runtime Inputs$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Runtime Inputs" })).toBeVisible({ timeout: 5_000 });
    await configFlow.getByPlaceholder("GOOGLE_ADS_CUSTOMER_ID").fill("123-456-7890");
    await expect(configFlow.getByText("Runtime inputs ready")).toBeVisible({ timeout: 5_000 });

    await configFlow.getByRole("button", { name: /^Triggers$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Agent Triggers" })).toBeVisible({ timeout: 5_000 });
    await configFlow.getByRole("button", { name: /^Next$/i }).click();
    await expect(configFlow.getByRole("heading", { name: "Review Your Agent" })).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Ready to deploy")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Google Ads Customer ID")).toBeVisible({ timeout: 5_000 });
    await expect(configFlow.getByText("Provided")).toBeVisible({ timeout: 5_000 });
    await expect(embeddedDeployButton).toBeEnabled({ timeout: 5_000 });
    await embeddedDeployButton.click();

    // Should hand off into the first-deploy workflow for the same agent.
    await page.waitForURL("**/agents/**/deploy?source=create&autoStart=1", { timeout: 15_000 });
    await expect(page.getByTestId("deploy-handoff-banner")).toContainText("Starting the first deployment", {
      timeout: 10_000,
    });
    await expect(page.getByText("Deployment successful")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => savedAgents.length).toBe(1);
    expect(savedAgents[0]).toMatchObject({
      name: "google-ads-optimizer",
      status: "active",
      sandbox_ids: ["sandbox-1"],
      runtime_inputs: [
        expect.objectContaining({
          key: "GOOGLE_ADS_CUSTOMER_ID",
          value: "123-456-7890",
        }),
      ],
      skills: ["google-ads-audit", "budget-pacing-report"],
      skill_graph: [
        expect.objectContaining({ skill_id: "google-ads-audit" }),
        expect.objectContaining({ skill_id: "budget-pacing-report" }),
      ],
    });

    await page.goto("/agents");
    await page.getByRole("button", { name: /^Build$/i }).click();
    await expect(page).toHaveURL(/\/agents\/create\?agentId=/);
    const reopenedFlow = page.getByTestId("copilot-config-stepper");
    await expect(reopenedFlow).toBeVisible({ timeout: 10_000 });
    await reopenedFlow.getByRole("button", { name: /^Runtime Inputs$/i }).click();
    await expect(reopenedFlow.getByRole("heading", { name: "Runtime Inputs" })).toBeVisible({ timeout: 5_000 });
    await expect(reopenedFlow.getByPlaceholder("GOOGLE_ADS_CUSTOMER_ID")).toHaveValue("123-456-7890");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Review page — editing agent name
  // ───────────────────────────────────────────────────────────────────────────
  test("allows editing agent name in review page", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Find and click the edit (pencil) button for the name
    const nameCard = page.locator("div").filter({ hasText: "google-ads-optimizer" }).first();
    await nameCard.waitFor({ state: "visible" });

    // Click the pencil icon button to edit name
    const editBtns = page.locator("button").filter({ has: page.locator("svg.lucide-pencil") });
    await editBtns.first().click();

    // The name input should appear
    const nameInput = page.locator("input[type='text']").first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    // Clear and type new name
    await nameInput.fill("super-finance-bot");

    // Save the edit (click the check button)
    const saveBtn = page.locator("button").filter({ has: page.locator("svg.lucide-check") });
    await saveBtn.first().click();

    // Verify new name is displayed
    await expect(page.getByText("super-finance-bot")).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Review page — editing rules
  // ───────────────────────────────────────────────────────────────────────────
  test("allows editing rules in review page", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Find the Rules section and click edit
    const rulesSection = page.locator("div").filter({ hasText: /^Rules$/ });
    await rulesSection.first().waitFor({ state: "visible" });

    // Click edit on the Rules section (there may be multiple pencil buttons)
    const sectionCards = page.locator("[class*='rounded-2xl']").filter({ hasText: "Rules" });
    const editBtn = sectionCards.first().locator("button").filter({ has: page.locator("svg.lucide-pencil") });
    await editBtn.click();

    // Should see "Add rule" button
    await expect(page.getByText("Add rule")).toBeVisible({ timeout: 5_000 });

    // Click "Add rule" and type a new rule
    await page.getByText("Add rule").click();
    const ruleInputs = page.locator("input[placeholder='Enter rule...']");
    const lastInput = ruleInputs.last();
    await lastInput.fill("Always respond in bullet points");

    // Save
    const saveBtn = sectionCards.first().locator("button").filter({ has: page.locator("svg.lucide-check") });
    await saveBtn.click();

    // Verify new rule appears
    await expect(page.getByText("Always respond in bullet points")).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Configure — Connect Tools step
  // ───────────────────────────────────────────────────────────────────────────
  test("shows tools derived from skill graph and allows connecting", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Should be on Connect Tools step
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByText("Give your agent access to the tools it needs to work.")).toBeVisible();

    // Continue button should be disabled (no tools connected)
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeDisabled();

    // Click Connect on a tool
    const connectBtns = page.getByRole("button", { name: /^Connect$/i });
    await connectBtns.first().click();

    // Sidebar should open
    await expect(page.getByText(/redirect you to/i)).toBeVisible({ timeout: 5_000 });

    // Click Connect in sidebar
    const sidebarConnectBtn = page.getByRole("button", { name: /^Connect$/i }).last();
    await sidebarConnectBtn.click();

    // The tool should now show "Disconnect"
    await expect(page.getByRole("button", { name: /Disconnect/i }).first()).toBeVisible({ timeout: 5_000 });

    // Continue button should now be enabled
    await expect(continueBtn).toBeEnabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: Configure — Skip Connect Tools
  // ───────────────────────────────────────────────────────────────────────────
  test("allows skipping the Connect Tools step", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Skip Connect Tools
    await page.getByRole("button", { name: /Skip this step/i }).click();

    // Should advance to Choose Skills (Step 2)
    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Choose Skills")).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: Configure — Choose Skills step
  // ───────────────────────────────────────────────────────────────────────────
  test("shows skills from skill graph with select/deselect toggle", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Skip to Choose Skills
    await page.getByRole("button", { name: /Skip this step/i }).click();

    // Should show skills from the skill graph
    await expect(page.getByText("Google Ads Audit")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Budget Pacing Report")).toBeVisible();

    // Both skills should be selected by default
    await expect(page.getByText("2 skills selected")).toBeVisible();

    // Deselect one
    await page.getByText("Google Ads Audit").click();
    await expect(page.getByText("1 skill selected")).toBeVisible();

    // Re-select it
    await page.getByText("Google Ads Audit").click();
    await expect(page.getByText("2 skills selected")).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: Configure — Set Triggers step
  // ───────────────────────────────────────────────────────────────────────────
  test("shows truthful deployable and manual-plan trigger states", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Skip to triggers
    await page.getByRole("button", { name: /Skip this step/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Should be on Set Triggers step
    await expect(page.getByText("Step 3 of 3")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Agent Triggers")).toBeVisible();

    // Pre-selected trigger based on agent rules (schedule keyword)
    await expect(page.getByText(/1 deployable/i)).toBeVisible({ timeout: 5_000 });

    // Search for a trigger
    await page.getByPlaceholder("Search triggers...").fill("webhook");
    await expect(page.getByText("Webhook POST")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Manual plan only")).toBeVisible({ timeout: 5_000 });

    // Clear search
    await page.getByPlaceholder("Search triggers...").fill("");

    // Filter by category
    await page.getByRole("button", { name: /Time-Based/i }).click();
    await expect(page.getByText("Cron Schedule")).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 10: Configure — "Suggest with AI" button works
  // ───────────────────────────────────────────────────────────────────────────
  test("Suggest with AI only pre-selects runtime-backed triggers", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Navigate to triggers step
    await page.getByRole("button", { name: /Skip this step/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Agent Triggers")).toBeVisible({ timeout: 5_000 });

    // Click Suggest with AI
    await page.getByRole("button", { name: /Suggest with AI/i }).click();

    // Should have selected only the supported schedule trigger
    await expect(page.getByText(/1 deployable/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/manual-plan/i)).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 11: Configure — Stepper navigation (back button)
  // ───────────────────────────────────────────────────────────────────────────
  test("stepper back button navigates between steps correctly", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Step 1 → Skip to Step 2
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await page.getByRole("button", { name: /Skip this step/i }).click();

    // Step 2 → Go back
    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 5_000 });
    // Click the back chevron button
    const backBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") });
    await backBtn.click();

    // Should be back at Step 1
    await expect(page.getByText("Step 1 of 3")).toBeVisible({ timeout: 5_000 });

    // First step back button should go to review
    await backBtn.click();
    await expect(page.getByText("Review your agent")).toBeVisible({ timeout: 10_000 });
  });

  test("preserves in-flight configure choices across review back-navigation", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    await page.getByRole("button", { name: /^Connect$/i }).first().click();
    await expect(page.getByRole("heading", { name: /Connect Google Ads/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Save Manual Plan/i }).click();
    await expect(page.getByText(/Manual integration plan saved/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: /Connect Google Ads/i })).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Disconnect/i }).first()).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Step 3 of 3")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/1 selected/i)).toBeVisible({ timeout: 5_000 });

    const backBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") }).first();
    await backBtn.click();
    await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 5_000 });
    await backBtn.click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible({ timeout: 5_000 });
    await backBtn.click();
    await expect(page.getByText("Review your agent")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Google Ads", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Manual setup")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Manual setup plan saved")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Cron Schedule")).toBeVisible({ timeout: 5_000 });

    await confirmReview(page);
    await expect(page.getByRole("button", { name: /Disconnect/i }).first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/1 selected/i)).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 12: Cancel exits to agents list
  // ───────────────────────────────────────────────────────────────────────────
  test("cancel button navigates to agents list", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Click cancel on the configure page
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    // Should navigate to agents list
    await page.waitForURL("**/agents", { timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 13: Review page — Test Agent panel
  // ───────────────────────────────────────────────────────────────────────────
  test("review page test agent panel opens and accepts input", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Click Test Agent button
    await page.getByRole("button", { name: /Test Agent/i }).click();

    // Test panel should open
    await expect(page.getByText("Testing as google-ads-optimizer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/Ask what this agent can do/i)).toBeVisible();

    // Type a test message
    await page.getByPlaceholder(/Ask what this agent can do/i).fill("What can you do?");
    await expect(page.getByRole("button", { name: /Send Test Message/i })).toBeEnabled();

    // Close test panel via Reset button
    await page.getByRole("button", { name: /Reset/i }).click();

    // Panel should close
    await expect(page.getByText("Testing as google-ads-optimizer")).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 14: Review page shows skills from architect output
  // ───────────────────────────────────────────────────────────────────────────
  test("review page displays skills extracted from architect", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Skills section should show the two skills
    await expect(page.getByText("Google Ads Audit")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Budget Pacing Report")).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 15: Review page shows rules from architect metadata
  // ───────────────────────────────────────────────────────────────────────────
  test("review page displays rules extracted from architect metadata", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Rules should include extracted metadata
    await expect(page.getByText(/professional/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/weekday/i).first()).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 16: Review page — back returns to chat
  // ───────────────────────────────────────────────────────────────────────────
  test("review page back button returns to chat view", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Click back/cancel on review page
    const backBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") });
    await backBtn.click();

    // Should return to chat
    await expect(page.getByText("Create New Agent")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("textarea")).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 17: Review page — confirm disabled with empty name
  // ───────────────────────────────────────────────────────────────────────────
  test("review page disables confirm button when name is empty", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Edit the name
    const editBtns = page.locator("button").filter({ has: page.locator("svg.lucide-pencil") });
    await editBtns.first().click();

    // Clear the name
    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill("");

    // Save empty name
    const saveBtn = page.locator("button").filter({ has: page.locator("svg.lucide-check") });
    await saveBtn.first().click();

    // Confirm button should be disabled
    const confirmBtn = page.getByRole("button", { name: /Confirm/i });
    await expect(confirmBtn).toBeDisabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 18: Configure — trigger selection persists across filter changes
  // ───────────────────────────────────────────────────────────────────────────
  test("supported trigger selections persist when switching filter categories", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Navigate to triggers step
    await page.getByRole("button", { name: /Skip this step/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Agent Triggers")).toBeVisible({ timeout: 5_000 });

    // Switch to Time-Based filter
    await page.getByRole("button", { name: /Time-Based/i }).click();

    // The supported schedule trigger stays selected and visible
    await expect(page.getByText("Cron Schedule")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/1 deployable/i)).toBeVisible({ timeout: 5_000 });

    // Switch to Event/Webhook filter and verify unsupported cards do not count as deployable
    await page.getByRole("button", { name: /Event\/Webhook/i }).click();
    await expect(page.getByText("Webhook POST")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Manual plan only")).toBeVisible({ timeout: 5_000 });

    // Switch to All filter
    await page.getByRole("button", { name: /^All/i }).click();

    await expect(page.getByText(/1 deployable/i)).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 19: Data Flow diagram shown in review
  // ───────────────────────────────────────────────────────────────────────────
  test("review page shows data flow diagram", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);

    // Data flow section should be visible
    await expect(page.getByText("Data flow")).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 20: Connect Tools — disconnect a connected tool
  // ───────────────────────────────────────────────────────────────────────────
  test("can disconnect a previously connected tool", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me a Google Ads optimizer");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });
    await proceedToReview(page);
    await confirmReview(page);

    // Connect a tool
    const connectBtns = page.getByRole("button", { name: /^Connect$/i });
    await connectBtns.first().click();
    // Click connect in sidebar
    const sidebarConnect = page.getByRole("button", { name: /^Connect$/i }).last();
    await sidebarConnect.click();

    // Verify connected
    const disconnectBtn = page.getByRole("button", { name: /Disconnect/i }).first();
    await expect(disconnectBtn).toBeVisible({ timeout: 5_000 });

    // Disconnect
    await disconnectBtn.click();

    // Should show Connect again
    await expect(page.getByRole("button", { name: /^Connect$/i }).first()).toBeVisible({ timeout: 5_000 });

    // Continue should be disabled again
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  test("deploy page shows persisted connector and trigger readiness", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "openclaw-agents",
        JSON.stringify({
          state: {
            agents: [
              {
                id: "agent-deploy",
                name: "Google Ads Optimizer",
                avatar: "🤖",
                description: "Optimizes paid media performance.",
                skills: ["Google Ads Audit", "Budget Pacing Report"],
                triggerLabel: "Cron Schedule",
                status: "draft",
                createdAt: "2026-03-26T00:00:00.000Z",
                sandboxIds: [],
                toolConnections: [
                  {
                    toolId: "google-ads",
                    name: "Google Ads",
                    description: "Inspect campaigns and budgets.",
                    status: "configured",
                    authKind: "oauth",
                    connectorType: "mcp",
                    configSummary: ["Connected account: Acme Ads"],
                  },
                  {
                    toolId: "slack",
                    name: "Slack",
                    description: "Post pacing alerts to the paid media channel.",
                    status: "missing_secret",
                    authKind: "oauth",
                    connectorType: "api",
                    configSummary: ["Missing bot token"],
                  },
                ],
                triggers: [
                  {
                    id: "cron-schedule",
                    title: "Weekday pacing check",
                    kind: "schedule",
                    status: "supported",
                    description: "Runs every weekday at 9 AM.",
                    schedule: "0 9 * * 1-5",
                  },
                  {
                    id: "webhook",
                    title: "Instant webhook",
                    kind: "webhook",
                    status: "unsupported",
                    description: "Would push updates when campaign spend spikes.",
                  },
                ],
                improvements: [],
              },
            ],
            isLoading: false,
          },
          version: 0,
        }),
      );
    });

    await page.goto("/agents/agent-deploy/deploy");

    await expect(page.getByText("Deploy readiness")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Action needed before deploy")).toBeVisible();
    await expect(page.getByText("1 configured, 1 needs credentials")).toBeVisible();
    await expect(page.getByText("1 supported, 1 unsupported")).toBeVisible();
    await expect(page.getByText("Google Ads")).toBeVisible();
    await expect(page.getByText("Slack")).toBeVisible();
    await expect(page.getByText("Weekday pacing check")).toBeVisible();
    await expect(page.getByText("Unsupported webhook")).toBeVisible();
  });
});
