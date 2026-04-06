/**
 * E2E tests for CoPilot Workspace capabilities during agent creation.
 *
 * Verifies that the copilot mode unlocks full workspace panels (terminal, code,
 * browser, files) and that the approval policy correctly allows dev operations
 * while blocking deployment commands.
 *
 * Mocks all API calls so no real backend is needed.
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

// ─── Mock architect response payloads ─────────────────────────────────────────

const ARCHITECT_READY_RESPONSE = {
  type: "ready_for_review",
  content: "I've analysed your requirements and built a skill graph with 2 skills.",
  skill_graph: {
    system_name: "api-research-agent",
    nodes: [
      {
        skill_id: "api-research",
        name: "API Research",
        description: "Research API documentation and capabilities",
        status: "generated",
        source: "custom",
        requires_env: [],
        external_api: null,
      },
      {
        skill_id: "code-generator",
        name: "Code Generator",
        description: "Generate integration code from API specs",
        status: "generated",
        source: "custom",
        requires_env: [],
        external_api: null,
      },
    ],
    workflow: {
      name: "main-workflow",
      description: "api-research-agent workflow",
      steps: [
        { id: "step-0", action: "execute", skill: "api-research", wait_for: [] },
        { id: "step-1", action: "execute", skill: "code-generator", wait_for: ["api-research"] },
      ],
    },
  },
  agent_metadata: {
    tone: "technical",
    primary_users: "developers",
  },
};

const ARCHITECT_AGENT_RESPONSE = {
  type: "agent_response",
  content: "I'll help you build an API research agent. Let me start working on that.",
};

const TEST_AGENT_RESPONSE = {
  type: "agent_response",
  content: "Configured tools: Google Ads. Trigger: weekday schedule. Runtime input: customer id present.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let savedAgents: Record<string, unknown>[] = [];
let architectCallCount = 0;
let sandboxCounter = 0;
let lastArchitectRequestBody: Record<string, unknown> | null = null;

/**
 * Build an SSE body with delta events + final result.
 * Simulates the bridge emitting incremental text deltas followed by a structured result.
 */
function buildDeltaSSE(
  deltas: string[],
  finalResponse: Record<string, unknown>,
): string {
  const lines: string[] = [];

  // Status event
  lines.push("event: status");
  lines.push(`data: ${JSON.stringify({ phase: "analyzing", message: "Analyzing..." })}`);
  lines.push("");

  // Delta events (incremental text chunks)
  for (const delta of deltas) {
    lines.push("event: delta");
    lines.push(`data: ${JSON.stringify({ text: delta })}`);
    lines.push("");
  }

  // Final result
  lines.push("event: result");
  lines.push(`data: ${JSON.stringify(finalResponse)}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Build a simple SSE body with status + result only (no deltas).
 */
function buildSimpleSSE(response: Record<string, unknown>): string {
  return [
    "event: status",
    `data: ${JSON.stringify({ phase: "analyzing", message: "Analyzing request..." })}`,
    "",
    "event: result",
    `data: ${JSON.stringify(response)}`,
    "",
  ].join("\n");
}

/**
 * Build an SSE body that includes approval events.
 * Simulates the bridge receiving a tool execution request and emitting approval events.
 */
function buildApprovalSSE(opts: {
  toolName: string;
  command: string;
  decision: "allow" | "deny";
  finalResponse: Record<string, unknown>;
}): string {
  const lines: string[] = [];

  lines.push("event: status");
  lines.push(`data: ${JSON.stringify({ phase: "tool_execution", message: `Executing: ${opts.toolName}...` })}`);
  lines.push("");

  if (opts.decision === "allow") {
    lines.push("event: approval_auto_allowed");
    lines.push(`data: ${JSON.stringify({
      approvalId: "approval-e2e",
      toolName: opts.toolName,
      decision: "allow",
      message: `Auto-allowed copilot tool request for ${opts.toolName}.`,
      summary: opts.command,
      policyReason: "Copilot mode allows dev operations.",
    })}`);
    lines.push("");
  } else {
    lines.push("event: approval_denied");
    lines.push(`data: ${JSON.stringify({
      approvalId: "approval-e2e",
      toolName: opts.toolName,
      decision: "deny",
      message: `Denied ${opts.toolName}. Deployment operations are blocked in copilot mode.`,
      summary: opts.command,
      policyReason: "Copilot mode blocks deployment operations.",
    })}`);
    lines.push("");
  }

  lines.push("event: result");
  lines.push(`data: ${JSON.stringify(opts.finalResponse)}`);
  lines.push("");

  return lines.join("\n");
}

/** Register Playwright route interceptors for the create page. */
async function mockApis(
  page: Page,
  opts?: {
    /** Custom SSE body for the architect bridge. If not provided, returns ARCHITECT_READY_RESPONSE. */
    architectSSE?: string;
    /** Number of calls before returning the custom/ready response */
    initialClarifications?: number;
  },
) {
  savedAgents = [];
  architectCallCount = 0;
  sandboxCounter = 0;
  lastArchitectRequestBody = null;
  const initialClarifications = opts?.initialClarifications ?? 0;

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

  // Architect bridge — POST /api/openclaw
  await page.route("**/api/openclaw", async (route: Route) => {
    architectCallCount++;
    const body = JSON.parse(route.request().postData() || "{}");
    lastArchitectRequestBody = body;

    if (body.mode === "test") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: buildSimpleSSE(TEST_AGENT_RESPONSE),
      });
      return;
    }

    if (architectCallCount <= initialClarifications) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: buildSimpleSSE({
          type: "clarification",
          content: "What kind of agent would you like to build?",
          context: "Tell me more about the agent you want to create.",
          questions: [],
        }),
      });
      return;
    }

    const sseBody = opts?.architectSSE ?? buildSimpleSSE(ARCHITECT_READY_RESPONSE);

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: sseBody,
    });
  });

  await page.route(`${API_BASE}/api/agents/create`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    sandboxCounter += 1;
    const body = JSON.parse(route.request().postData() || "{}");
    const agentId = `agent-${sandboxCounter}`;
    const forgeSandboxId = `sandbox-${sandboxCounter}`;

    savedAgents.push({
      id: agentId,
      name: body.name ?? "New Agent",
      avatar: "🤖",
      description: body.description ?? "",
      skills: [],
      status: "forging",
      forge_sandbox_id: forgeSandboxId,
      sandbox_ids: [forgeSandboxId],
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
        stream_id: `stream-${sandboxCounter}`,
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

  await page.route(`${API_BASE}/api/agents/*/forge`, async (route: Route) => {
    const id = route.request().url().split("/api/agents/")[1].split("/forge")[0];
    const agent = savedAgents.find((candidate) => (candidate as { id: string }).id === id);

    if (!agent || !(agent as { forge_sandbox_id?: string }).forge_sandbox_id) {
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
        forge_sandbox_id: (agent as { forge_sandbox_id: string }).forge_sandbox_id,
        status: "ready",
        sandbox: {
          sandbox_id: (agent as { forge_sandbox_id: string }).forge_sandbox_id,
          sandbox_name: "copilot-forge",
          gateway_port: 18789,
          vnc_port: 6080,
        },
      }),
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
      const body = JSON.parse(route.request().postData() || "{}");
      const agent = {
        id: `agent-${Date.now()}`,
        name: body.name || "New Agent",
        avatar: body.avatar || "🤖",
        description: body.description || "",
        skills: body.skills || [],
        status: body.status || "draft",
        sandbox_ids: [],
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

  // Individual agent CRUD
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
      const agent = savedAgents.find((a) => (a as { id: string }).id === id);
      await route.fulfill({
        status: agent ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(agent ?? { error: "Not found" }),
      });
    } else if (route.request().method() === "PATCH") {
      const id = url.split("/api/agents/")[1];
      const body = JSON.parse(route.request().postData() || "{}");
      const idx = savedAgents.findIndex((a) => (a as { id: string }).id === id);
      if (idx >= 0) {
        savedAgents[idx] = { ...savedAgents[idx], ...body, updated_at: new Date().toISOString() };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedAgents[idx]) });
      } else {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      }
    } else {
      // Fall back so more-specific earlier-registered handlers (e.g. api/agents/create) can match
      await route.fallback();
    }
  });

  // Agent config patch
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
        (savedAgents[idx] as Record<string, unknown>).updated_at = new Date().toISOString();
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedAgents[idx]) });
      } else {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: "Not found" }) });
      }
    } else {
      await route.continue();
    }
  });

  // Sandboxes
  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else {
      await route.continue();
    }
  });

  // Skills catalog
  await page.route(`${API_BASE}/api/skills`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { skill_id: "api-research", name: "API Research", description: "Research API documentation", tags: ["research"], skill_md: "# API Research" },
        { skill_id: "code-generator", name: "Code Generator", description: "Generate code from specs", tags: ["code"], skill_md: "# Code Generator" },
      ]),
    });
  });
}

/** Navigate to the create page in Co-Pilot mode and wait for it to load. */
async function goToCreatePage(page: Page) {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("e.g. Google Ads Manager").fill("API Research Agent");
  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 15_000 });
}

/** Type a message in the builder chat and submit. */
async function sendBuilderMessage(page: Page, text: string) {
  // The chat textarea placeholder varies by stage — use the visible textarea
  const ta = page.locator("textarea:visible").first();
  await ta.waitFor({ state: "visible", timeout: 10_000 });
  await ta.click();
  await ta.fill(text);
  const sendBtn = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
  await expect(sendBtn).not.toBeDisabled({ timeout: 5_000 });
  await sendBtn.click();
  await expect(ta).toHaveValue("", { timeout: 8_000 });
}

/** Fill in purpose metadata (name + description) via the config panel inputs. */
async function fillPurposeMetadata(page: Page) {
  await page.getByPlaceholder("e.g., Google Ads Manager").fill("API Research Agent");
  await page.getByPlaceholder(/Manages Google Ads campaigns/i).fill(
    "Researches APIs, reads documentation, and generates integration code.",
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("CoPilot Workspace — Tab Visibility", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 1: Workspace tabs are visible but locked before purpose metadata.
   * Once name + description are filled, workspace tabs unlock.
   */
  test("workspace tabs unlock when purpose metadata is provided", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    // Purpose was set during forge init (name: "API Research Agent").
    // Workspace tabs should be visible and clickable.
    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    const codeTab = page.getByRole("button", { name: /^code$/i }).last();
    const filesTab = page.getByRole("button", { name: /^files$/i }).last();
    const browserTab = page.getByRole("button", { name: /^browser$/i }).last();

    await expect(terminalTab).toBeVisible({ timeout: 5_000 });
    await expect(codeTab).toBeVisible({ timeout: 5_000 });
    await expect(filesTab).toBeVisible({ timeout: 5_000 });
    await expect(browserTab).toBeVisible({ timeout: 5_000 });

    // Tabs should be clickable
    await terminalTab.click();
    await expect(terminalTab).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 2: Config tab is active by default in CoPilot mode.
   */
  test("config tab is active by default in copilot mode", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    // Config tab should be active
    await expect(page.getByTestId("computer-tab-config")).toHaveAttribute("data-active", "true", { timeout: 5_000 });
  });

  /**
   * TEST 3: Terminal tab shows empty state when clicked.
   */
  test("terminal tab shows empty state when no tools have executed", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    // Click terminal tab (purpose already set from forge init)
    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    await terminalTab.click();

    // Should show empty terminal state
    await expect(page.getByText("No commands run yet").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 4: Code tab shows empty state when clicked.
   */
  test("code tab shows empty state when no files edited", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    const codeTab = page.getByRole("button", { name: /^code$/i }).last();
    await codeTab.click();

    await expect(page.getByText("No files edited yet").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 5: Browser tab shows empty state when clicked.
   */
  test("browser tab shows empty state when no browsing occurred", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    const browserTab = page.getByRole("button", { name: /^browser$/i }).last();
    await browserTab.click();

    // Browser tab should be active and show the browser view area
    await expect(browserTab).toBeVisible({ timeout: 5_000 });
    // The browser panel renders a VNC/preview area — verify it's present
    await expect(page.getByRole("img", { name: /browser/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("CoPilot Workspace — Copilot Bridge Mode", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 6: Bridge receives mode="copilot" from the CoPilot create flow.
   */
  test("bridge receives copilot mode in request body", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build me an API research agent");

    // Wait for response
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });

    // Verify the bridge received mode="copilot"
    expect(lastArchitectRequestBody).not.toBeNull();
    expect((lastArchitectRequestBody as Record<string, unknown>).mode).toBe("copilot");
  });
});

test.describe("CoPilot Workspace — Delta Streaming", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 7: Delta events stream text incrementally to the chat.
   */
  test("delta events stream text to chat incrementally", async ({ page }) => {
    const sseBody = buildDeltaSSE(
      [
        "Let me research ",
        "the API documentation ",
        "for you. ",
        "I'll start by browsing the official docs.",
      ],
      {
        ...ARCHITECT_AGENT_RESPONSE,
        content: "Let me research the API documentation for you. I'll start by browsing the official docs.",
      },
    );

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Research the Stripe API");

    // The full streamed text should appear in the chat
    await expect(
      page.getByText("browsing the official docs").first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("CoPilot Workspace — Approval Policy", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 8: Copilot mode allows file write operations (approval_auto_allowed event).
   */
  test("copilot mode shows approval_auto_allowed for file writes", async ({ page }) => {
    const sseBody = buildApprovalSSE({
      toolName: "apply_patch",
      command: "Write skill file to workspace",
      decision: "allow",
      finalResponse: {
        type: "agent_response",
        content: "I've created the skill file in your workspace.",
      },
    });

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Create a skill file for the API research agent");

    // Should see the tool execution status (lifecycle event shows tool_execution phase)
    await expect(
      page.getByText(/skill file/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  /**
   * TEST 9: Copilot mode denies deployment operations (approval_denied event).
   */
  test("copilot mode shows denial for deploy operations", async ({ page }) => {
    const sseBody = buildApprovalSSE({
      toolName: "deploy_agent",
      command: "deploy --production",
      decision: "deny",
      finalResponse: {
        type: "agent_response",
        content: "I was unable to deploy because deployment operations are restricted during agent creation.",
      },
    });

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Deploy the agent to production");

    // Should see the agent's response about deployment being restricted
    await expect(
      page.getByText(/unable to deploy|restricted|deployment/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("CoPilot Workspace — Task Plan in Create Flow", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 10: Task plan renders from delta-streamed <plan> blocks in copilot mode.
   */
  test("task plan renders from plan block in copilot delta stream", async ({ page }) => {
    const planText = [
      "Let me plan this out:\n",
      "<plan>\n",
      "- [ ] Research API endpoints\n",
      "- [ ] Analyze authentication methods\n",
      "- [ ] Generate integration code\n",
      "</plan>\n",
      "Starting with the API research...",
    ];

    const sseBody = buildDeltaSSE(planText, {
      type: "agent_response",
      content: planText.join(""),
    });

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Plan the API integration research");

    // Wait for the response to render
    await expect(
      page.getByText("Starting with the API research").first()
    ).toBeVisible({ timeout: 15_000 });

    // Task plan items should be visible
    await expect(page.getByText("Research API endpoints").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Analyze authentication methods").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Generate integration code").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("CoPilot Workspace — Full Create Flow with Workspace", () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  /**
   * TEST 11: Full flow — Chat with deltas → skill graph → workspace tabs accessible.
   * Verifies that the copilot workspace integrates with the wizard flow end-to-end.
   */
  test("full copilot flow: chat with deltas produces skill graph and unlocks workspace", async ({ page }) => {
    const sseBody = buildDeltaSSE(
      [
        "I've analysed your requirements ",
        "and built a skill graph with 2 skills. ",
        "The API Research skill will handle documentation browsing, ",
        "and the Code Generator will produce integration code.",
      ],
      ARCHITECT_READY_RESPONSE,
    );

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    // Send message to architect via the flexible textarea selector
    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("Build an API research agent");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
    await sendButton.click();

    // Wait for the response to appear in chat
    await expect(
      page.getByText(/skill graph|Code Generator|API Research/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Workspace tabs should be visible (purpose set from forge init)
    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    await expect(terminalTab).toBeVisible({ timeout: 5_000 });

    // Click terminal tab — should show empty state
    await terminalTab.click();
    await expect(page.getByText("No commands run yet").first()).toBeVisible({ timeout: 5_000 });
  });

  test("embedded review test agent stays local to the copilot shell", async ({ page }) => {
    const sseBody = buildDeltaSSE(
      ["Built 2 skills for API research."],
      ARCHITECT_READY_RESPONSE,
    );

    await mockApis(page, { architectSSE: sseBody });
    await goToCreatePage(page);

    // Send message via the chat input
    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("Build an API research agent");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
    await sendButton.click();

    // The architect response should appear in the chat
    await expect(page.getByText("skill graph with 2 skills").first()).toBeVisible({ timeout: 15_000 });

    // The copilot shell should remain on the create page (not redirect elsewhere)
    await expect(page).toHaveURL(/\/agents\/create\?agentId=/);
    await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible();
  });
});
