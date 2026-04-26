/**
 * E2E coverage for the collaborative-checkpoint feature set.
 *
 * Validates three behaviors shipped across Phase 1–4:
 *  1. `<ask_user>` markers in architect text stream render as structured
 *     inputs in PendingQuestionsPanel above the chat input.
 *  2. Submitting answers composes a single user message in the documented
 *     format and sends it through the chat pipeline.
 *  3. "Ask architect to revise" on PRD/TRD/Plan sends a
 *     `[target: …]`-prefixed message.
 *
 * All backend calls are mocked — this exercises the React component tree,
 * Zustand store, marker extractor, and consumer dispatcher end-to-end
 * without needing a live sandbox.
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

function buildSseResponse(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.flatMap(({ event, data }) => [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    "",
  ]).join("\n");
}

// ── Track architect request bodies so tests can assert on composed messages ──
let architectRequestBodies: Record<string, unknown>[] = [];

/**
 * Mock the architect bridge, auth, and forge setup. The architect returns
 * whatever delta text the caller provides via `deltaSupplier`, which lets
 * each test inject its own `<ask_user>` or other marker stream.
 */
async function mockStack(
  page: Page,
  opts: {
    deltaSupplier?: (requestBody: Record<string, unknown>) => string;
  } = {},
) {
  architectRequestBodies = [];

  await page.context().addCookies([
    { name: "accessToken", value: "test-access-token", url: APP_ORIGIN },
    { name: "refreshToken", value: "test-refresh-token", url: APP_ORIGIN },
  ]);

  await page.route(`${API_BASE}/users/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTHENTICATED_USER) });
  });

  await page.route(`${API_BASE}/api/auth/me`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_SESSION) });
  });

  // GitHub OAuth status — the init screen disables "Bring to life" until this returns connected.
  await page.route(`${API_BASE}/api/auth/github/status`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: true, username: "test-user" }),
    });
  });

  // Architect bridge — capture body + emit caller-supplied delta text
  await page.route("**/api/openclaw", async (route: Route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    architectRequestBodies.push(body);
    const deltaText = opts.deltaSupplier?.(body) ?? "";

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: buildSseResponse([
        { event: "status", data: { phase: "analyzing", message: "Analyzing..." } },
        ...(deltaText ? [{ event: "delta", data: { text: deltaText } }] : []),
        {
          event: "result",
          data: {
            type: "agent_response",
            content: deltaText || "OK",
          },
        },
      ]),
    });
  });

  // Forge create — returns a fresh agent id + sandbox
  await page.route(`${API_BASE}/api/agents/create`, async (route: Route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agent_id: `agent-${Date.now()}`, stream_id: "stream-1", name: body.name }),
    });
  });

  await page.route(`${API_BASE}/api/agents/*/forge/stream/*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: [
        "event: result",
        `data: ${JSON.stringify({ sandbox_id: "sandbox-1" })}`,
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n"),
    });
  });

  await page.route(`${API_BASE}/api/agents/*/forge`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        forge_sandbox_id: "sandbox-1",
        status: "ready",
        sandbox: { sandbox_id: "sandbox-1", sandbox_name: "forge", gateway_port: 18789, vnc_port: 6080 },
      }),
    });
  });

  await page.route(`${API_BASE}/api/agents`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else {
      await route.fallback();
    }
  });

  // Catch-all agent GET so hydration doesn't 404 and bounce the page
  await page.route(`${API_BASE}/api/agents/*`, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: route.request().url().split("/api/agents/")[1].split("?")[0].split("/")[0],
        name: "Test Agent",
        forge_sandbox_id: "sandbox-1",
      }),
    });
  });
}

async function startNewAgent(page: Page, name = "Ads Manager") {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("e.g. Google Ads Manager").fill(name);
  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
}

/**
 * Jump the copilot store past the Reveal stage directly to Think.
 * The `<ask_user>` marker extractor only fires when devStage ∈ {think, plan},
 * so tests that want to exercise checkpoints must advance past reveal first.
 */
async function jumpToThinkStage(page: Page) {
  await expect.poll(async () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: {
          getState?: () => {
            setDevStage?: (stage: string) => void;
            setRevealStatus?: (status: string) => void;
            setAgentSandboxId?: (id: string) => void;
          };
        };
      };
      const store = w.__coPilotStore?.getState?.();
      if (!store?.setDevStage) return false;
      store.setRevealStatus?.("approved");
      store.setDevStage("think");
      store.setAgentSandboxId?.("sandbox-1");
      return true;
    }),
  ).toBe(true);
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Collaborative checkpoints (Phase 1–4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  test("PendingQuestionsPanel renders structured inputs for <ask_user> markers", async ({ page }) => {
    // Architect's first-turn checkpoint: three questions covering every type the panel handles.
    const checkpointDelta =
      "Before I start, I want to lock down a few things:\n" +
      "1. Who are the primary users?\n" +
      "2. Which ad platforms should we focus on first?\n" +
      "3. Should the agent be able to pause campaigns autonomously?\n\n" +
      '<ask_user id="q1" type="text" question="Who are the primary users?"/>\n' +
      `<ask_user id="q2" type="select" question="Which ad platforms should we focus on first?" options='["Google Ads","Meta Ads","LinkedIn Ads"]'/>\n` +
      '<ask_user id="q3" type="boolean" question="Should the agent be able to pause campaigns autonomously?"/>\n';

    await mockStack(page, { deltaSupplier: () => checkpointDelta });
    await startNewAgent(page);
    await jumpToThinkStage(page);

    // Kick off a turn so the architect emits the checkpoint delta
    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("Build me a Google Ads optimizer.");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
    await sendButton.click();

    // Panel should appear with the checkpoint banner
    await expect(
      page.getByText(/Architect is waiting on 3 questions/i),
    ).toBeVisible({ timeout: 10_000 });

    // The panel is uniquely identified by its text-input placeholder and the
    // structural buttons for select/boolean types. Assert on those rather than
    // the question strings (which also appear in the architect's chat prose).

    // Question 1 — text input with the panel's placeholder
    await expect(page.locator("input[placeholder='Type your answer…']")).toBeVisible();

    // Questions 2 & 3 — select pills and yes/no buttons should each have
    // exactly one match inside the panel.
    await expect(page.getByRole("button", { name: "Google Ads" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Meta Ads" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "LinkedIn Ads" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Yes" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "No" })).toHaveCount(1);

    // "Send answers" disabled until all 3 are answered
    const sendAnswers = page.getByRole("button", { name: /Send answers/i });
    await expect(sendAnswers).toBeDisabled();
  });

  test("submitting answers composes a single chat message in the documented format", async ({ page }) => {
    // Turn 1: architect asks checkpoint questions. Turn 2: architect proceeds
    // with work (no questions) so the panel stays cleared after the user sends.
    let turn = 0;
    const deltaSupplier = () => {
      turn++;
      if (turn === 1) {
        return '<ask_user id="q1" type="text" question="Who are the primary users?"/>\n' +
               `<ask_user id="q2" type="select" question="Which platform?" options='["Google Ads","Meta Ads"]'/>\n` +
               '<ask_user id="q3" type="boolean" question="Autonomous pausing?"/>\n';
      }
      return "Thanks — proceeding with research now.";
    };

    await mockStack(page, { deltaSupplier });
    await startNewAgent(page);
    await jumpToThinkStage(page);

    const textarea = page.locator("textarea:visible").first();
    await textarea.fill("Build me a Google Ads optimizer.");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await sendButton.click();

    await expect(page.getByText(/Architect is waiting on 3 questions/i)).toBeVisible({ timeout: 10_000 });

    // Answer each question — scope to the panel to avoid matching the button
    // variant of "Yes/No/Google Ads" that may appear elsewhere in the UI.
    const panel = page
      .locator("div")
      .filter({ hasText: /Architect is waiting on 3 questions/i })
      .first();
    const answerInput = panel.locator("input[placeholder='Type your answer…']").first();
    await answerInput.fill("Paid media managers");
    await panel.getByRole("button", { name: "Google Ads" }).click();
    await panel.getByRole("button", { name: "No" }).click();

    const sendAnswers = page.getByRole("button", { name: /Send answers/i });
    await expect(sendAnswers).toBeEnabled();

    const callCountBefore = architectRequestBodies.length;
    await sendAnswers.click();

    // Wait for a new architect call triggered by the composed message
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThan(callCountBefore);
    const latest = architectRequestBodies[architectRequestBodies.length - 1];
    const message = String(latest.message ?? "");

    expect(message).toContain("Here are my answers:");
    expect(message).toContain("1. Who are the primary users?");
    expect(message).toContain("Paid media managers");
    expect(message).toContain("Google Ads");
    expect(message).toContain("No");

    // Panel should clear once user sends
    await expect(page.getByText(/Architect is waiting on/i)).toBeHidden({ timeout: 5_000 });
  });

  test("RequestChangesButton sends a [target: PRD] prefixed message", async ({ page }) => {
    // Architect's response to the revise click — just a short ack.
    await mockStack(page, { deltaSupplier: () => "OK, I'll revise that section." });

    await startNewAgent(page);
    await jumpToThinkStage(page);

    // Directly seed discovery documents so StepDiscovery renders — this test
    // exercises the artifact-revision UI, not the architect → workspace hydration
    // path (which depends on sandboxExec).
    await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: {
          getState?: () => {
            setDiscoveryDocuments?: (docs: unknown) => void;
            setThinkStatus?: (s: string) => void;
          };
        };
      };
      const store = w.__coPilotStore?.getState?.();
      store?.setDiscoveryDocuments?.({
        prd: {
          title: "Product Requirements Document",
          sections: [
            { heading: "Problem Statement", content: "Ads waste." },
            { heading: "Target Users", content: "PMMs." },
          ],
        },
        trd: {
          title: "Technical Requirements Document",
          sections: [{ heading: "Architecture Overview", content: "Skills + dashboard." }],
        },
      });
      store?.setThinkStatus?.("ready");
    });

    // The "Ask architect to revise PRD" button should be present
    const revisePrd = page.getByRole("button", { name: /Ask architect to revise PRD/i });
    await expect(revisePrd).toBeVisible({ timeout: 10_000 });

    const callCountBefore = architectRequestBodies.length;
    await revisePrd.click();

    // Inline textarea appears
    const reviseTextarea = page
      .locator("textarea[placeholder*='What should change']")
      .first();
    await expect(reviseTextarea).toBeVisible({ timeout: 5_000 });
    await reviseTextarea.fill("Add a step for Google Ads account linking.");

    await page.getByRole("button", { name: /^Send$/ }).click();

    // Verify the architect received a [target: PRD] prefixed message
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThan(callCountBefore);
    const latest = architectRequestBodies[architectRequestBodies.length - 1];
    const message = String(latest.message ?? "");

    expect(message).toContain("[target: PRD]");
    expect(message).toContain("Add a step for Google Ads account linking");
  });
});
