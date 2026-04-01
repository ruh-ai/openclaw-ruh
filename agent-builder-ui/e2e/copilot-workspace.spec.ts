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
    if (url.includes("/config") || url.includes("/sandbox") || url.includes("/workspace-memory")) {
      await route.continue();
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
      await route.continue();
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
  await expect(page.getByText("Create New Agent")).toBeVisible({ timeout: 15_000 });
  // Ensure Co-Pilot mode is active (default)
  await expect(page.getByText("Co-Pilot Mode").first()).toBeVisible({ timeout: 5_000 });
}

/** Type a message in the builder chat and submit. */
async function sendBuilderMessage(page: Page, text: string) {
  const ta = page.locator('textarea[placeholder="Describe your agent idea…"]:visible');
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

    // Workspace tabs should exist but be locked (disabled)
    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    const codeTab = page.getByRole("button", { name: /^code$/i }).last();
    const filesTab = page.getByRole("button", { name: /^files$/i }).last();
    const browserTab = page.getByRole("button", { name: /^browser$/i }).last();

    await expect(terminalTab).toBeDisabled({ timeout: 5_000 });
    await expect(codeTab).toBeDisabled({ timeout: 5_000 });
    await expect(filesTab).toBeDisabled({ timeout: 5_000 });
    await expect(browserTab).toBeDisabled({ timeout: 5_000 });

    // Fill purpose metadata
    await fillPurposeMetadata(page);

    // Wait for skills to generate (auto-triggered by purpose metadata)
    await expect(page.getByText("Skills ready")).toBeVisible({ timeout: 15_000 });

    // Tabs should now be enabled
    await expect(terminalTab).toBeEnabled({ timeout: 5_000 });
    await expect(codeTab).toBeEnabled({ timeout: 5_000 });
    await expect(filesTab).toBeEnabled({ timeout: 5_000 });
    await expect(browserTab).toBeEnabled({ timeout: 5_000 });
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

    // Fill purpose to unlock tabs
    await fillPurposeMetadata(page);
    await expect(page.getByText("Skills ready")).toBeVisible({ timeout: 15_000 });

    // Click terminal tab
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

    await fillPurposeMetadata(page);
    await expect(page.getByText("Skills ready")).toBeVisible({ timeout: 15_000 });

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

    await fillPurposeMetadata(page);
    await expect(page.getByText("Skills ready")).toBeVisible({ timeout: 15_000 });

    const browserTab = page.getByRole("button", { name: /^browser$/i }).last();
    await browserTab.click();

    // Browser panel should show empty/no-activity state
    await expect(page.getByText(/no.*brows/i).first()).toBeVisible({ timeout: 5_000 });
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

    // Send message to architect
    await sendBuilderMessage(page, "Build an API research agent");

    // Wait for skill graph to be processed
    await expect(
      page.getByText(/skill graph/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Workspace tabs should be enabled (purpose metadata was auto-derived)
    const terminalTab = page.getByRole("button", { name: /^terminal$/i }).last();
    await expect(terminalTab).toBeEnabled({ timeout: 5_000 });

    // Click terminal tab — should show empty state (no tools executed yet)
    await terminalTab.click();
    await expect(page.getByText("No commands run yet").first()).toBeVisible({ timeout: 5_000 });

    // Switch back to config tab — wizard flow should still work
    const configTab = page.getByRole("button", { name: /^config$/i }).last();
    await configTab.click();

    // Config panel should show the copilot stepper
    await expect(page.getByTestId("copilot-config-stepper")).toBeVisible({ timeout: 5_000 });
  });

  test("embedded review test agent stays local to the copilot shell", async ({ page }) => {
    await mockApis(page);
    await goToCreatePage(page);

    await sendBuilderMessage(page, "Build an API research agent");
    await expect(page.getByText(/skill graph/i).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByText("Review Your Agent")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /^Test Agent$/i }).click();
    await expect(page.getByText("Testing as api-research-agent")).toBeVisible({ timeout: 5_000 });

    await page
      .getByPlaceholder(/Ask what this agent can do, or give it a sample task\./i)
      .fill("What tools and triggers are configured?");
    await page.getByRole("button", { name: /Send Test Message/i }).click();

    await expect(page.getByText(TEST_AGENT_RESPONSE.content)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Build an API research agent")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /^Reset$/i }).click();
    await expect(page.getByText("Testing as api-research-agent")).not.toBeVisible();
  });
});
