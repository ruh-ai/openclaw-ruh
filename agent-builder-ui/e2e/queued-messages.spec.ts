/**
 * E2E coverage for the pair-programmer message queue (Phase 1).
 *
 * Validates the queue behavior shipped in TabChat.tsx + QueuedMessagesChip.tsx:
 *   1. The chat input send button is enabled in builder mode while a turn
 *      is in flight (isLoading=true).
 *   2. Submitting a message while the architect is mid-turn enqueues it
 *      locally — the message does NOT immediately reach the architect bridge.
 *   3. QueuedMessagesChip renders above the input with the correct count.
 *   4. The expanded list shows each queued text; "Clear all" empties the queue.
 *   5. On the falling edge of isLoading, the queue drains: the next architect
 *      bridge call carries the queued text as its `message` field.
 *
 * The architect bridge SSE stream is held open via `holdResolver`; the test
 * releases it explicitly to simulate a turn completing. This lets us hold
 * isLoading=true on demand without timing-dependent waits.
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

let architectRequestBodies: Record<string, unknown>[] = [];
let releaseHold: (() => void) | null = null;
let holdPromise: Promise<void> | null = null;

/** Reset hold state and create a fresh promise the test can release later. */
function arm() {
  holdPromise = new Promise<void>((resolve) => { releaseHold = resolve; });
}

/** Release the held architect SSE response so isLoading flips back to false. */
function release() {
  releaseHold?.();
}

async function mockStack(page: Page) {
  architectRequestBodies = [];
  arm();

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

  await page.route(`${API_BASE}/api/auth/github/status`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: true, username: "test-user" }),
    });
  });

  // Architect bridge — capture body, then hold the SSE response open until
  // the test releases. This keeps `isLoading` true so subsequent submits land
  // in the queue. After release, emit a single agent_response result so
  // `isLoading` flips back to false and the queue can drain.
  await page.route("**/api/openclaw", async (route: Route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    architectRequestBodies.push(body);
    if (holdPromise) await holdPromise;
    arm(); // re-arm for the next request

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: buildSseResponse([
        { event: "status", data: { phase: "writing", message: "Writing..." } },
        { event: "delta", data: { text: "ok" } },
        { event: "result", data: { type: "agent_response", content: "ok" } },
      ]),
    });
  });

  await page.route(`${API_BASE}/api/agents/create`, async (route: Route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agent_id: `agent-${Date.now()}`, stream_id: "stream-1", name: body.name }),
    });
  });

  // Use regex matchers — Playwright glob treats '?' as a single-char wildcard
  // so the noStoreUrl `?_=<ts>` cache-buster suffix on real requests would
  // miss a `*/forge` glob.
  await page.route(/\/api\/agents\/[^/]+\/forge\/stream\/[^/?]+/, async (route: Route) => {
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

  await page.route(/\/api\/agents\/[^/]+\/forge(\?|$)/, async (route: Route) => {
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

  await page.route(/\/api\/agents(\?|$)/, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else {
      await route.fallback();
    }
  });

  await page.route(/\/api\/agents\/[^/?]+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/api/agents/")[1].split("/")[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id,
        name: "Test Agent",
        forge_sandbox_id: "sandbox-1",
        status: "forging",
      }),
    });
  });

  // /api/sandboxes/<id> — returned shape varies, give the minimum useAgentChat needs
  await page.route(/\/api\/sandboxes\/[^/?]+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sandbox_id: "sandbox-1",
        sandbox_name: "forge",
        gateway_port: 18789,
        vnc_port: 6080,
        approved: true,
      }),
    });
  });

  // Conversation list endpoints — return empty lists so chat history loads cleanly
  await page.route(/\/api\/conversations(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(/\/api\/agents\/[^/]+\/conversations(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
}

async function startNewAgent(page: Page, name = "Queue Test Agent") {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("e.g. Google Ads Manager").fill(name);
  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
}

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

test.describe("Pair-programmer queue (Phase 1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("openclaw-agents");
    });
  });

  test("send button stays enabled in builder mode while a turn is in flight", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToThinkStage(page);

    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("First message — kicks off a turn.");

    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
    await sendButton.click();

    // First architect call lands; bridge is held open so isLoading=true.
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThanOrEqual(1);

    // Type a second message while the first is still in flight.
    await textarea.fill("Second message — should be queued.");

    // The send button MUST remain enabled even though isLoading=true.
    // (Pre-fix behavior: disabled. Post-fix: enabled with a tooltip.)
    await expect(sendButton).not.toBeDisabled();

    release();
  });

  test("submitting during isLoading enqueues and shows QueuedMessagesChip", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToThinkStage(page);

    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });

    // Turn 1
    await textarea.fill("First message.");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await sendButton.click();
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThanOrEqual(1);

    const requestsAfterFirst = architectRequestBodies.length;

    // Submit a second message while the first is held — should NOT reach the
    // bridge yet, only the queue.
    await textarea.fill("Queued first.");
    await sendButton.click();

    // Architect call count unchanged — the message stayed in the queue.
    await expect.poll(() => architectRequestBodies.length).toBe(requestsAfterFirst);

    // Chip surfaces the count.
    await expect(page.getByText(/1 message queued/i)).toBeVisible({ timeout: 5_000 });

    // Add a third while still held.
    await textarea.fill("Queued second.");
    await sendButton.click();
    await expect(page.getByText(/2 messages queued/i)).toBeVisible({ timeout: 5_000 });

    // Expand the chip to verify each queued text is listed.
    await page.getByText(/2 messages queued/i).click();
    await expect(page.getByText("Queued first.")).toBeVisible();
    await expect(page.getByText("Queued second.")).toBeVisible();

    // Clear all empties the chip without sending anything.
    await page.getByRole("button", { name: /Clear all/i }).click();
    await expect(page.getByText(/queued/i)).toHaveCount(0);
    expect(architectRequestBodies.length).toBe(requestsAfterFirst);

    release();
  });

  test("queue drains on the falling edge of isLoading", async ({ page }) => {
    await mockStack(page);
    await startNewAgent(page);
    await jumpToThinkStage(page);

    const textarea = page.locator("textarea:visible").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });

    // Turn 1 — held open
    await textarea.fill("First message.");
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    await sendButton.click();
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThanOrEqual(1);

    // Queue a second message
    await textarea.fill("Drain me first.");
    await sendButton.click();
    await expect(page.getByText(/1 message queued/i)).toBeVisible({ timeout: 5_000 });

    const callsBeforeRelease = architectRequestBodies.length;

    // Release turn 1 — useAgentChat flips isLoading false, queue drain effect fires.
    release();

    // The queued message should now be the next architect bridge call.
    await expect.poll(() => architectRequestBodies.length).toBeGreaterThan(callsBeforeRelease);
    const drained = architectRequestBodies[architectRequestBodies.length - 1];
    expect(String(drained.message ?? "")).toContain("Drain me first.");

    // Chip should disappear once the queue is empty.
    await expect(page.getByText(/queued/i)).toHaveCount(0);

    release();
  });
});
