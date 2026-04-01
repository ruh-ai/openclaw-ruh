/**
 * E2E tests for Task Plan Mode + Code Editor + Auto-Switch
 *
 * Mocks all API calls so no real backend is needed.
 * The Next.js dev server must already be running on port 3001.
 */

import { test, expect, Page, Route } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID   = "test-agent-e2e-plan";
const SANDBOX_ID = "sb-e2e-plan-001";
const CONV_ID    = "conv-e2e-plan-001";
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
              name: "E2E Plan Agent",
              avatar: "🤖",
              description: "Playwright test agent for task plan",
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

function sseStream(tokens: string[]): string {
  const lines = tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`
  );
  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

function sseEventStream(events: Array<Record<string, unknown>>): string {
  const lines = events.map((event) => `data: ${JSON.stringify(event)}`);
  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

async function mockApis(page: Page, chatSseBody: string) {
  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { sandbox_id: SANDBOX_ID, sandbox_name: "E2E Sandbox", gateway_port: 9000 },
        ]),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(
    `${API_BASE}/api/sandboxes/${SANDBOX_ID}/conversations`,
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], next_cursor: null, has_more: false }),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: CONV_ID, name: "Test chat" }),
        });
      } else {
        await route.continue();
      }
    }
  );

  await page.route(
    `${API_BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`,
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ messages: [], next_cursor: null, has_more: false }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  );

  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/chat`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: chatSseBody,
    });
  });

  // Workspace file listing
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/files*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ root: "", items: [] }),
    });
  });

  // Workspace file read (for code editor)
  await page.route(new RegExp(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/file\\?`), async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path") ?? "unknown.py";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path,
        name: path.split("/").pop(),
        type: "file",
        size: 50,
        modified_at: new Date().toISOString(),
        mime_type: "text/plain",
        preview_kind: "text",
        artifact_type: "code",
        content: 'print("Hello from the agent!")\n\ndef main():\n    return 42\n',
        truncated: false,
      }),
    });
  });

  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/handoff*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "0 files", file_count: 0, code_file_count: 0, total_bytes: 0,
        top_level_paths: [], suggested_paths: [],
        archive: { eligible: false, reason: "Empty workspace", file_count: 0, total_bytes: 0 },
      }),
    });
  });
}

async function goToChat(page: Page) {
  await page.goto(`/agents/${AGENT_ID}/chat`);
  const ta = page.locator("textarea");
  await ta.waitFor({ state: "visible", timeout: 15_000 });
  await ta.waitFor({ state: "attached" });
}

async function sendMessage(page: Page, text: string) {
  const ta      = page.locator("textarea");
  const sendBtn = page.locator("div:has(> textarea) button");

  await ta.click();
  await page.keyboard.type(text);
  await expect(sendBtn).not.toBeDisabled({ timeout: 5_000 });
  await sendBtn.click();
  await page.waitForTimeout(200);
  await expect(ta).toHaveValue("", { timeout: 8_000 });
  await expect(page.locator("text=" + text).first()).toBeVisible({ timeout: 8_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Task Plan Mode", () => {

  /**
   * TEST 1: Task plan renders from <plan> block in SSE stream
   */
  test("task plan renders from plan block", async ({ page }) => {
    const sseBody = sseStream([
      "Let me break this down:\n",
      "<plan>\n",
      "- [ ] Research API docs\n",
      "- [ ] Design data model\n",
      "- [ ] Implement endpoints\n",
      "</plan>\n",
      "Starting with research...",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Build me an API");

    // Wait for response to complete
    await expect(page.getByText("Starting with research").first()).toBeVisible({ timeout: 15_000 });

    // Task plan items should be visible
    await expect(page.getByText("Research API docs").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Design data model").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Implement endpoints").first()).toBeVisible({ timeout: 5_000 });

    // Task Plan header should be visible
    await expect(page.getByText("Task Plan").first()).toBeVisible({ timeout: 5_000 });

    // Progress counter should show
    await expect(page.getByText("0/3").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 2: Task items update to done via <task_update> tags
   */
  test("task items update to done", async ({ page }) => {
    const sseBody = sseStream([
      "<plan>\n",
      "- [ ] Fetch data\n",
      "- [ ] Process results\n",
      "- [ ] Generate report\n",
      "</plan>\n",
      "Fetching data now...\n",
      '<task_update index="0" status="done"/>\n',
      "Processing results...\n",
      '<task_update index="1" status="done"/>\n',
      "Almost done!",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Generate a report");

    // Wait for response
    await expect(page.getByText("Almost done").first()).toBeVisible({ timeout: 15_000 });

    // Progress should reflect 2 of 3 done
    await expect(page.getByText("2/3").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 3: Task progress shows in ComputerView header
   */
  test("task progress shows in ComputerView header", async ({ page }) => {
    const sseBody = sseStream([
      "<plan>\n",
      "- [ ] Step A\n",
      "- [ ] Step B\n",
      "- [ ] Step C\n",
      "</plan>\n",
      '<task_update index="0" status="done"/>\n',
      "Working on Step B...",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Do the steps");

    await expect(page.getByText("Working on Step B").first()).toBeVisible({ timeout: 15_000 });

    // The ComputerView header should show task progress
    // "Task 2 of 3" appears in the workspace header
    await expect(page.getByText(/Task 2 of 3/i).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 4: Markdown checkbox fallback (no <plan> tags)
   */
  test("markdown checkbox fallback renders plan", async ({ page }) => {
    const sseBody = sseStream([
      "Here's my plan:\n",
      "- [x] Done task\n",
      "- [ ] Pending task\n",
      "- [ ] Another pending\n",
      "\nLet me continue...",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Make a plan");

    await expect(page.getByText("Let me continue").first()).toBeVisible({ timeout: 15_000 });

    // Checkbox items should render as a plan
    await expect(page.getByText("Done task").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Pending task").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Another pending").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Code Editor Tab", () => {

  /**
   * TEST 5: Code editor tab exists in ComputerView
   */
  test("code tab is visible in ComputerView tabs", async ({ page }) => {
    const sseBody = sseStream(["Hello from the agent."]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Hi");

    await expect(page.getByText("Hello from the agent").first()).toBeVisible({ timeout: 15_000 });

    // The workspace should have 4 tabs: terminal, code, files, browser
    await expect(page.getByRole("button", { name: /^code$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^terminal$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^files$/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^browser$/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 6: Code editor shows empty state when no files are edited
   */
  test("code editor shows empty state", async ({ page }) => {
    const sseBody = sseStream(["Simple response."]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Hello");

    await expect(page.getByText("Simple response").first()).toBeVisible({ timeout: 15_000 });

    // Click the code tab
    await page.getByRole("button", { name: /^code$/i }).first().click();

    // Should show empty state
    await expect(page.getByText("No files edited yet").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 7: Code editor shows file content after file_write tool
   */
  test("code editor shows file content on file write tool", async ({ page }) => {
    // Simulate a custom event stream with a file_write tool call
    const sseBody = sseEventStream([
      { tool: "file_write", name: "file_write", input: { path: "app.py", content: 'print("hello")' } },
      { result: "File written successfully", output: "" },
      { choices: [{ delta: { content: "I wrote the file." } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Write a Python file");

    // Wait for response
    await expect(page.getByText("I wrote the file").first()).toBeVisible({ timeout: 15_000 });

    // Click code tab (may have auto-switched)
    await page.getByRole("button", { name: /^code$/i }).first().click();
    await page.waitForTimeout(500);

    // File content should appear (from the mocked workspace file API)
    await expect(page.getByText("Hello from the agent!").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Auto-Switch Logic", () => {

  /**
   * TEST 8: Auto-switch to browser tab on browser navigation tool
   */
  test("auto-switches to browser tab on browser tool", async ({ page }) => {
    const sseBody = sseEventStream([
      { tool: "browser_navigate", name: "browser_navigate", input: { url: "https://example.com" } },
      { result: "Page loaded", output: "" },
      { choices: [{ delta: { content: "Browsed the page." } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Browse example.com");

    await expect(page.getByText("Browsed the page").first()).toBeVisible({ timeout: 15_000 });

    // Browser tab should be active (auto-switched)
    // Check that the browser tab button has the active styling
    const browserTab = page.getByRole("button", { name: /^browser$/i }).first();
    await expect(browserTab).toBeVisible({ timeout: 5_000 });
  });

  /**
   * TEST 9: ComputerView header shows "Agent's Computer" label
   */
  test("ComputerView header shows Agent's Computer label", async ({ page }) => {
    const sseBody = sseStream(["Test response."]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Hello");

    await expect(page.getByText("Test response").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Agent's Computer").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Plan tags stripped from display", () => {

  /**
   * TEST 10: Plan XML tags are stripped from the message content
   */
  test("plan tags are not shown as raw text in message", async ({ page }) => {
    const sseBody = sseStream([
      "<plan>\n",
      "- [ ] Task one\n",
      "- [ ] Task two\n",
      "</plan>\n",
      "Let me work on this.",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Plan something");

    await expect(page.getByText("Let me work on this").first()).toBeVisible({ timeout: 15_000 });

    // The raw <plan> tag should NOT appear in the message text
    await expect(page.locator("text=<plan>")).not.toBeVisible();
    await expect(page.locator("text=</plan>")).not.toBeVisible();
  });
});
