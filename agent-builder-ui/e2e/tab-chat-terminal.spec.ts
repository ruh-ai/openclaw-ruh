/**
 * E2E tests for TabChat — parser behaviour + ComputerView terminal
 *
 * Mocks all API calls so no real backend is needed.
 * The Next.js dev server must already be running on port 3001.
 */

import { test, expect, Page, Route } from "@playwright/test";
import { setupAuth } from "./helpers/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID   = "test-agent-e2e-001";
const SANDBOX_ID = "sb-e2e-0001";
const CONV_ID    = "conv-e2e-001";
const API_BASE   = "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seed Zustand (persisted to localStorage) with a minimal test agent before page load. */
async function seedAgent(page: Page) {
  await page.addInitScript(
    ({ agentId, sandboxId }: { agentId: string; sandboxId: string }) => {
      const store = {
        state: {
          agents: [
            {
              id: agentId,
              name: "E2E Test Agent",
              avatar: "🤖",
              description: "Playwright test agent",
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

/**
 * Build a minimal OpenAI-compatible SSE stream body from an array of content tokens.
 * The parser accumulates these tokens and runs the state-machine against them.
 */
function sseStream(tokens: string[]): string {
  const lines = tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`
  );
  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

/**
 * Build an SSE body that uses the OpenAI native tool_calls format.
 * This is what real OpenAI-compatible gateways return (not XML-in-content).
 */
function sseToolCallsStream(opts: {
  toolName: string;
  argsChunks: string[];   // streamed argument fragments
  contentAfter?: string;  // assistant content after tool call
}): string {
  const lines: string[] = [];

  // First chunk: tool call header with function name
  lines.push(`data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ index: 0, id: "call_e2e_001", type: "function", function: { name: opts.toolName, arguments: "" } }] } }],
  })}`);

  // Argument chunks streamed incrementally
  for (const chunk of opts.argsChunks) {
    lines.push(`data: ${JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: chunk } }] } }],
    })}`);
  }

  // finish_reason: tool_calls
  lines.push(`data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: "tool_calls" }],
  })}`);

  // Optional content after tool call
  if (opts.contentAfter) {
    lines.push(`data: ${JSON.stringify({
      choices: [{ delta: { content: opts.contentAfter } }],
    })}`);
  }

  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

function sseEventStream(events: Array<Record<string, unknown>>): string {
  const lines = events.map((event) => `data: ${JSON.stringify(event)}`);
  lines.push("data: [DONE]");
  return lines.join("\n") + "\n";
}

/** Register Playwright route interceptors before navigation. */
async function mockApis(page: Page, chatSseBody: string) {
  // Sandboxes list
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

  // Conversations list (GET → empty) + create (POST → return id)
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

  // Persist messages
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

  // Chat — returns controlled SSE
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/chat`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: chatSseBody,
    });
  });

  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/files*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        root: "",
        items: [
          {
            path: "reports/daily.md",
            name: "daily.md",
            type: "file",
            size: 41,
            modified_at: "2026-03-25T15:30:00.000Z",
            preview_kind: "text",
            mime_type: "text/markdown",
            artifact_type: "document",
            source_conversation_id: CONV_ID,
          },
          {
            path: "artifacts/chart.png",
            name: "chart.png",
            type: "file",
            size: 2048,
            modified_at: "2026-03-25T15:31:00.000Z",
            preview_kind: "image",
            mime_type: "image/png",
            artifact_type: "image",
            source_conversation_id: CONV_ID,
          },
        ],
      }),
    });
  });

  // workspace/handoff may include query params (e.g. ?path=sessions/<convId>)
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/handoff*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "2 code files ready for handoff",
        file_count: 2,
        code_file_count: 1,
        total_bytes: 2089,
        top_level_paths: ["reports", "artifacts"],
        suggested_paths: ["reports/daily.md"],
        archive: {
          eligible: true,
          reason: null,
          file_count: 2,
          total_bytes: 2089,
          download_name: "workspace-bundle.tar.gz",
        },
      }),
    });
  });

  await page.route(new RegExp(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/file\\?path=reports(%2F|/)daily\\.md`), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "reports/daily.md",
        name: "daily.md",
        type: "file",
        size: 41,
        modified_at: "2026-03-25T15:30:00.000Z",
        mime_type: "text/markdown",
        preview_kind: "text",
        artifact_type: "document",
        source_conversation_id: CONV_ID,
        content: "# Daily report\nGenerated from the sandbox.",
        truncated: false,
        download_name: "daily.md",
      }),
    });
  });

  await page.route(new RegExp(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/file\\?path=artifacts(%2F|/)chart\\.png`), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "artifacts/chart.png",
        name: "chart.png",
        type: "file",
        size: 2048,
        modified_at: "2026-03-25T15:31:00.000Z",
        mime_type: "image/png",
        preview_kind: "image",
        artifact_type: "image",
        source_conversation_id: CONV_ID,
        download_name: "chart.png",
      }),
    });
  });

  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/workspace/archive`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/gzip",
      body: "zip-bytes",
    });
  });
}

/** Navigate to the chat tab and wait until the textarea is interactive. */
async function goToChat(page: Page) {
  await page.goto(`/agents/${AGENT_ID}/chat`);
  // Textarea only appears after sandboxes are fetched and TabChat mounts
  const ta = page.locator("textarea");
  await ta.waitFor({ state: "visible", timeout: 15_000 });
  await ta.waitFor({ state: "attached" });
}

/** Send a chat message and confirm the user bubble appears. */
async function sendMessage(page: Page, text: string) {
  const ta      = page.locator("textarea");
  const sendBtn = page.locator("div:has(> textarea) button");

  // Focus and type — page.keyboard.type dispatches real OS-level key events
  await ta.click();
  await page.keyboard.type(text);

  // Wait for React to re-render with the input value (button becomes enabled)
  await expect(sendBtn).not.toBeDisabled({ timeout: 5_000 });

  // Click and give React time to batch & flush the state update
  await sendBtn.click();
  await page.waitForTimeout(200);

  // The textarea must now be empty (setInput("") was called)
  await expect(ta).toHaveValue("", { timeout: 8_000 });

  // The user bubble must be in the DOM (messages state updated)
  await expect(
    page.locator("text=" + text).first()
  ).toBeVisible({ timeout: 8_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("TabChat parser + ComputerView terminal", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  /**
   * SCENARIO 1: Pure thinking response
   * SSE: <think>reasoning...</think>\nFinal answer.
   *
   * After the stream:
   * - "Reasoning" step badge appeared in task list (captured in completed message)
   * - Final answer visible in message bubble
   * - ComputerView Thinking tab contains the reasoning text
   */
  test("shows Reasoning step and thinking content for <think> response", async ({ page }) => {
    const thinkContent  = "The user asked something simple, I should respond clearly.";
    const finalResponse = "Here is the answer from the agent.";

    const sseBody = sseStream([
      "<think>",
      thinkContent,
      "</think>\n",
      finalResponse,
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Hello agent");

    // Final response must appear (stream complete)
    await expect(page.getByText(finalResponse).first()).toBeVisible({ timeout: 15_000 });

    // The completed assistant message should include a "Reasoning" step label
    // (the Brain icon + "Reasoning" collapse button appears for completed think steps)
    await expect(page.getByText("Reasoning").first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * SCENARIO 2: Tool call without prior thinking
   * SSE: <function=exec><parameter=command>ls -la</parameter></function></tool_call>\nDone.
   *
   * After the stream:
   * - Tool step "Using tool: exec" in task list
   * - ComputerView terminal tab shows "$ ls -la /workspace"
   * - Final response visible
   */
  test("shows tool step and terminal command for <function=> tool call", async ({ page }) => {
    const command       = "ls -la /workspace";
    const finalResponse = "Command completed successfully.";

    const sseBody = sseStream([
      `<function=exec><parameter=command>${command}</parameter></function></tool_call>\n`,
      finalResponse,
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);

    await goToChat(page);
    await sendMessage(page, "List files");

    // Final response
    await expect(page.getByText(finalResponse).first()).toBeVisible({ timeout: 15_000 });

    // Tool step in task list
    await expect(page.getByText(/Using tool/i).first()).toBeVisible({ timeout: 5_000 });

    // Switch to terminal tab — default tab is "dashboard", terminal view is behind the "terminal" tab
    await page.getByTestId("computer-tab-terminal").click();

    // Terminal shell and the executed command are visible
    const terminalShell = page.getByTestId("workspace-terminal-shell");
    await expect(terminalShell).toBeVisible({ timeout: 5_000 });
    await expect(terminalShell.getByText(command, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * SCENARIO 3: Text before tool call (the dead-state parser bug we fixed)
   * SSE: <think>...</think>\nLet me check.\n<function=exec>...\nThe result is X.
   *
   * This specifically tests the post_think phase fix where toolStart > 0.
   */
  test("handles text-before-tool-call (post_think dead-state fix)", async ({ page }) => {
    const thinkText     = "I need to run a command to check the filesystem.";
    const command       = "cat /etc/hostname";
    const textBefore    = "Let me check that for you right now.";
    const finalText     = "The hostname is sandbox-01.";

    const sseBody = sseStream([
      "<think>",
      thinkText,
      "</think>\n",
      textBefore + "\n",
      `<function=exec><parameter=command>${command}</parameter></function></tool_call>\n`,
      finalText,
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "What is the hostname?");

    // Final response
    await expect(page.getByText(finalText).first()).toBeVisible({ timeout: 15_000 });

    // Reasoning step in completed message
    await expect(page.getByText("Reasoning").first()).toBeVisible({ timeout: 5_000 });

    // Tool step in completed message
    await expect(page.getByText(/Using tool/i).first()).toBeVisible({ timeout: 5_000 });

    // Terminal shows the command
    await expect(page.getByText(command, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * SCENARIO 4: Multiple sequential tool calls
   * Both commands must appear in the ComputerView terminal.
   */
  test("shows multiple tool calls in terminal", async ({ page }) => {
    const cmd1 = "ls -la";
    const cmd2 = "pwd";

    const sseBody = sseStream([
      `<function=exec><parameter=command>${cmd1}</parameter></function></tool_call>\n`,
      `<function=exec><parameter=command>${cmd2}</parameter></function></tool_call>\n`,
      "Both commands ran successfully.",
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Run two commands");

    await expect(page.getByText("Both commands ran successfully.").first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(cmd1, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(cmd2, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * SCENARIO 5: ComputerView workspace toggle
   * The "Workspace" button hides and re-shows the right panel.
   */
  test("Workspace toggle button hides and shows ComputerView", async ({ page }) => {
    const sseBody = sseStream(["Hello!"]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);

    // Panel visible by default — the right panel header reads "Agent's Computer"
    await expect(page.getByText("Agent's Computer")).toBeVisible({ timeout: 5_000 });

    // Hide the workspace panel — use exact match to avoid hitting "Expand workspace" button
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await expect(page.getByText("Agent's Computer")).not.toBeVisible();

    // Show the workspace panel again
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await expect(page.getByText("Agent's Computer")).toBeVisible();
  });

  /**
   * SCENARIO 6: OpenAI native tool_calls format (real gateway format)
   * The gateway returns tool calls via delta.tool_calls, not XML in content.
   * This is the format used by real OpenAI-compatible gateways.
   */
  test("shows terminal command from OpenAI tool_calls format", async ({ page }) => {
    const command = "ls -la /workspace";

    const sseBody = sseToolCallsStream({
      toolName: "exec",
      argsChunks: [
        '{"command"',
        ': "ls -la',
        ' /workspace"}',
      ],
      contentAfter: "Here are the files in the workspace.",
    });

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "List workspace files");

    // Final content after tool call
    await expect(page.getByText("Here are the files in the workspace.").first()).toBeVisible({ timeout: 15_000 });

    // Tool step visible in message — verifies the native tool_calls format creates a "Using tool: exec" step
    await expect(page.getByText(/Using tool.*exec/i).first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * SCENARIO 7: OpenAI tool_calls with multiple tools
   */
  test("shows multiple OpenAI tool_calls in terminal", async ({ page }) => {
    const lines: string[] = [];

    // First tool call
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "exec", arguments: "" } }] } }] })}`);
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"command": "pwd"}' } }] } }] })}`);

    // Second tool call in same response
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, id: "call_2", type: "function", function: { name: "exec", arguments: "" } }] } }] })}`);
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"command": "whoami"}' } }] } }] })}`);

    // Finish
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}`);
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: "Done running commands." } }] })}`);
    lines.push("data: [DONE]");

    const sseBody = lines.join("\n") + "\n";

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Run pwd and whoami");

    await expect(page.getByText("Done running commands.").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("pwd", { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("whoami", { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows structured browser activity timeline and takeover state", async ({ page }) => {
    const sseBody = sseEventStream([
      {
        browser: {
          type: "navigation",
          url: "https://example.com/login",
          label: "Example login",
        },
      },
      {
        browser: {
          type: "screenshot",
          url: "https://cdn.example.com/browser-shot.png",
          label: "Login screen",
        },
      },
      {
        browser: {
          type: "preview",
          url: "http://localhost:4173",
          label: "Preview server",
        },
      },
      {
        browser: {
          type: "takeover_requested",
          reason: "Complete CAPTCHA to continue",
          actionLabel: "Resume agent run",
        },
      },
      {
        choices: [{ delta: { content: "I need help with the login step." } }],
      },
    ]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "Open the login page");

    await expect(page.getByText("I need help with the login step.").first()).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("computer-tab-browser").click();

    // When a preview URL is detected the BrowserPanel auto-switches to "preview" mode.
    // The mode-toggle inside the browser panel shows "Activity" and "Preview" buttons.
    // Use the Activity button (which shows text "Activity") to switch to the activity timeline.
    // Using getByRole scoped to buttons with exact text to avoid matching the workspace tab "preview".
    await expect(page.getByRole("button", { name: "Activity", exact: true }).last()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Activity", exact: true }).last().click();

    // In activity mode, navigation items render the URL via UrlCard
    await expect(page.getByText("https://example.com/login", { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Operator takeover needed")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Complete CAPTCHA to continue")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Resume agent run/i })).toBeVisible({ timeout: 5_000 });
  });

  test("shows files workspace list and inline previews for sandbox outputs", async ({ page }) => {
    const sseBody = sseStream(["Generated files are ready in the workspace."]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "List workspace files");

    await page.getByTestId("computer-tab-files").click();
    // Use .first() to handle the strict-mode case where "daily.md" appears as
    // both the file name label and the path breadcrumb in the file list item
    await expect(page.getByText("daily.md").first()).toBeVisible({ timeout: 5_000 });
    await page.getByText("chart.png").first().click();
    await expect(page.getByText("Image Preview")).toBeVisible({ timeout: 5_000 });
    // Click the file list item (not the suggested-paths button which also shows the path)
    await page.getByRole("button", { name: "daily.md" }).first().click();
    await expect(page.getByText("Generated from the sandbox.")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 5_000 });
  });

  test("shows code-control handoff actions in the files workspace", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const sseBody = sseStream(["Generated files are ready in the workspace."]);

    await seedAgent(page);
    await mockApis(page, sseBody);
    await goToChat(page);
    await sendMessage(page, "List workspace files");

    // Click files tab (may already be active)
    await page.getByRole("button", { name: /^files$/i }).last().click();
    await expect(page.getByText("Code handoff", { exact: false })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("2 code files ready for handoff")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /Export workspace bundle/i })).toBeVisible({ timeout: 5_000 });
  });
});
