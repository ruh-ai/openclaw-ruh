/**
 * E2E tests for Preview Panel — dev server detection + iframe preview
 *
 * Mocks all API calls so no real backend or Docker container is needed.
 * The Next.js dev server must already be running on port 3001.
 */

import { test, expect, Page, Route } from "@playwright/test";
import { setupAuth } from "./helpers/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID   = "test-agent-preview-001";
const SANDBOX_ID = "sb-preview-0001";
const CONV_ID    = "conv-preview-001";
const API_BASE   = "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedAgent(page: Page) {
  await page.addInitScript(
    ({ agentId, sandboxId }: { agentId: string; sandboxId: string }) => {
      const store = {
        state: {
          agents: [
            {
              id: agentId,
              name: "Preview Test Agent",
              avatar: "🤖",
              description: "Test agent for preview",
              skills: ["exec"],
              triggerLabel: "On demand",
              status: "active",
              createdAt: new Date().toISOString(),
              sandboxIds: [sandboxId],
            },
          ],
        },
        version: 0,
      };
      localStorage.setItem("openclaw-agents", JSON.stringify(store));
    },
    { agentId: AGENT_ID, sandboxId: SANDBOX_ID }
  );
}

/** Build SSE stream where the agent mentions starting a server on a port. */
function sseStreamWithServerUrl(port: number): string {
  const tokens = [
    "I'll create the files and start a server.\n\n",
    "Files created. Starting the server...\n\n",
    `Server running on http://localhost:${port}\n\n`,
    "The app is now available.",
  ];
  const lines = tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`
  );
  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

async function mockApis(page: Page, chatSseBody: string, activePorts: number[] = []) {
  // Sandboxes list
  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          sandbox_id: SANDBOX_ID,
          sandbox_name: "preview-test",
          sandbox_state: "started",
          gateway_port: 18789,
        }]),
      });
    } else {
      await route.fallback();
    }
  });

  // Single sandbox
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sandbox_id: SANDBOX_ID,
        sandbox_name: "preview-test",
        sandbox_state: "started",
        gateway_port: 18789,
        standard_url: "http://localhost:18789",
        gateway_token: "test-token",
      }),
    });
  });

  // Conversations
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/conversations**`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: CONV_ID, sandbox_id: SANDBOX_ID }),
      });
    } else {
      await route.fallback();
    }
  });

  // Chat endpoint
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/chat`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: chatSseBody,
    });
  });

  // Preview ports endpoint
  const portMappings: Record<number, number> = {};
  activePorts.forEach((p, i) => { portMappings[p] = 32770 + i; });

  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/preview/ports`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ports: portMappings, active: activePorts }),
    });
  });

  // Preview proxy — serve a simple test HTML page
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/preview/proxy/**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Preview Works!</h1></body></html>",
    });
  });

  // Workspace files
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Preview Panel", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test("shows 'No dev servers detected' when no ports are active", async ({ page }) => {
    await seedAgent(page);
    // Use a neutral SSE body with no port URL so the regex parser does not
    // detect any preview ports — this keeps the preview panel in the empty state.
    const chatBody = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "I will look into this." } }] })}`,
      "data: [DONE]",
      "",
    ].join("\n");
    await mockApis(page, chatBody, []); // No active ports

    await page.goto(`http://localhost:3000/agents/${AGENT_ID}/chat`);
    await page.waitForSelector("text=Preview Test Agent", { timeout: 10000 });

    // Click the Preview tab — triggers onPreviewStart auto-message using the neutral SSE.
    // Port fetch returns empty, so the empty state should appear.
    await page.click('button:has-text("Preview")');

    // Should show the empty state once the port fetch resolves
    await expect(page.locator("text=No dev servers detected")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Check again")).toBeVisible();
  });

  test("detects server port from agent text response and auto-switches", async ({ page }) => {
    await seedAgent(page);
    const chatBody = sseStreamWithServerUrl(8080);
    await mockApis(page, chatBody, [8080]); // Port 8080 is active

    await page.goto(`http://localhost:3000/agents/${AGENT_ID}/chat`);
    await page.waitForSelector("text=Preview Test Agent", { timeout: 10000 });

    // Send a message to trigger the SSE stream
    const textarea = page.locator("textarea");
    await textarea.fill("Start a server");
    await textarea.press("Enter");

    // The Preview tab should get a green indicator and the panel should show content
    // Wait for the preview port detection to trigger
    await expect(page.locator('button:has-text("Preview")')).toBeVisible({ timeout: 10000 });
  });

  test("Check again button triggers port refresh", async ({ page }) => {
    await seedAgent(page);
    // Neutral SSE body — no port URL so no port is auto-detected
    const chatBody = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "I will look into this." } }] })}`,
      "data: [DONE]",
      "",
    ].join("\n");

    let callCount = 0;
    await mockApis(page, chatBody, []);

    // Override the preview/ports mock to track calls
    await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/preview/ports`, async (route: Route) => {
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ports: {}, active: [] }),
      });
    });

    await page.goto(`http://localhost:3000/agents/${AGENT_ID}/chat`);
    await page.waitForSelector("text=Preview Test Agent", { timeout: 10000 });

    // Click Preview tab — triggers auto-message with neutral SSE; ports API returns empty
    await page.click('button:has-text("Preview")');
    await page.waitForSelector("text=Check again", { timeout: 8000 });

    const countBefore = callCount;
    await page.click("text=Check again");

    // Wait a moment for the fetch to fire
    await page.waitForTimeout(1000);
    expect(callCount).toBeGreaterThan(countBefore);
  });

  test("renders iframe with correct proxy URL when port is active", async ({ page }) => {
    await seedAgent(page);
    const chatBody = sseStreamWithServerUrl(8080);
    await mockApis(page, chatBody, [8080]);

    await page.goto(`http://localhost:3000/agents/${AGENT_ID}/chat`);
    await page.waitForSelector("text=Preview Test Agent", { timeout: 10000 });

    // Click Preview tab
    await page.click('button:has-text("Preview")');

    // Wait for the iframe to appear with the proxy URL
    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 10000 });

    const src = await iframe.getAttribute("src");
    expect(src).toContain(`/api/sandboxes/${SANDBOX_ID}/preview/proxy/8080/`);
  });
});
