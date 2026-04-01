/**
 * E2E tests for TabSettings — model selection and pass-through to API requests.
 *
 * Mocks all API calls so no real backend is needed.
 * The Next.js dev server must already be running on port 3001.
 *
 * Critical paths verified:
 *   1. Settings tab renders and shows provider/model cards
 *   2. Selecting a model saves it (checkmark shown)
 *   3. Model persists after page reload (localStorage)
 *   4. Chat request body includes selected model
 *   5. Conversation creation body includes selected model
 *   6. Falls back to "openclaw-default" when no model is selected
 */

import { test, expect, Page } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID   = "test-agent-settings-001";
const SANDBOX_ID = "sb-settings-0001";
const CONV_ID    = "conv-settings-001";
const API_BASE   = "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seed agent without a model preference set. */
async function seedAgent(page: Page, model?: string) {
  await page.addInitScript(
    ({ agentId, sandboxId, model }: { agentId: string; sandboxId: string; model?: string }) => {
      if (localStorage.getItem("openclaw-agents")) return;
      const store = {
        state: {
          agents: [
            {
              id: agentId,
              name: "Settings Test Agent",
              avatar: "⚙️",
              description: "Agent for settings e2e",
              skills: ["exec"],
              triggerLabel: "On demand",
              status: "active",
              createdAt: new Date().toISOString(),
              sandboxIds: [sandboxId],
              ...(model ? { model } : {}),
            },
          ],
        },
        version: 0,
      };
      localStorage.setItem("openclaw-agents", JSON.stringify(store));
    },
    { agentId: AGENT_ID, sandboxId: SANDBOX_ID, model }
  );
}

/** Mock the sandboxes list API so the chat page shows tabs instead of "Not deployed". */
async function mockSandboxes(
  page: Page,
  opts?: { sharedCodexEnabled?: boolean; sharedCodexModel?: string | null },
) {
  await page.route(`${API_BASE}/api/sandboxes`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          sandbox_id: SANDBOX_ID,
          sandbox_name: "settings-test-sandbox",
          sandbox_state: "running",
          gateway_port: 18789,
          approved: true,
          shared_codex_enabled: opts?.sharedCodexEnabled ?? false,
          shared_codex_model: opts?.sharedCodexModel ?? null,
        },
      ]),
    })
  );
}

async function mockModels(
  page: Page,
  models: Array<{ id: string; object?: string; created?: number; owned_by?: string }>,
) {
  await page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/models`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        object: "list",
        data: models.map((model) => ({
          object: "model",
          created: 0,
          owned_by: "openclaw",
          ...model,
        })),
      }),
    })
  );
}

/** Mock conversation creation — captures the request body. */
function mockConversationCreate(page: Page): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      resolve(body);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: CONV_ID, name: body.name, model: body.model }),
      });
    });
  });
}

/** Mock the chat endpoint — captures the request body. */
function mockChat(page: Page): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/chat`, (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      resolve(body);
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"delta":{"content":"Hello!"}}]}\ndata: [DONE]\n',
      });
    });
  });
}

/** Mock conversation messages endpoint (needed after chat). */
async function mockMessages(page: Page) {
  await page.route(
    `${API_BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`,
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [], next_cursor: null, has_more: false }),
    })
  );
}

/** Mock the provider reconfiguration endpoint — captures the request body. */
function mockReconfigure(page: Page): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    page.route(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/reconfigure-llm`, (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      resolve(body);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provider: body.provider,
          model: body.model ?? "gpt-4o",
          logs: ["Config updated", "Gateway restarted"],
          configured: { apiKey: "sk-12***cdef" },
        }),
      });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("TabSettings — model selection", () => {
  test("renders Settings tab with provider and model cards", async ({ page }) => {
    await seedAgent(page);
    await mockSandboxes(page);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    // Provider headers visible
    await expect(page.getByRole("button", { name: /^Anthropic\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^OpenAI \/ Codex\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Google Gemini\b/ })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Ollama (local)" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^OpenRouter\b/ })).toBeVisible();

    // Model cards visible
    await expect(page.getByRole("button", { name: /^Claude Sonnet 4\.6\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^GPT-4o gpt-4o$/ })).toBeVisible();

    // No model selected → shows "using gateway default" message
    await expect(page.getByText(/using gateway default/)).toBeVisible();
  });

  test("renders live models returned by the sandbox models endpoint", async ({ page }) => {
    await seedAgent(page);
    await mockSandboxes(page);
    await mockModels(page, [
      { id: "gpt-5.4-mini" },
      { id: "claude-3.7-sonnet" },
    ]);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    await expect(page.getByRole("button", { name: /gpt-5\.4-mini/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /claude-3\.7-sonnet/i })).toBeVisible();
  });

  test("selecting a model shows checkmark and active model summary", async ({ page }) => {
    await seedAgent(page);
    await mockSandboxes(page);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    // Click Claude Sonnet 4.6
    await page.getByRole("button", { name: /^Claude Sonnet 4\.6\b/ }).click();

    // Active model summary appears
    await expect(page.getByText(/Active model/)).toBeVisible();
    await expect(page.getByTestId("active-model-id")).toHaveText("claude-sonnet-4-6");

    // "using gateway default" message gone
    await expect(page.getByText(/using gateway default/)).not.toBeVisible();
  });

  test("model selection persists after page reload", async ({ page }) => {
    await seedAgent(page);
    await mockSandboxes(page);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);
    await page.getByRole("button", { name: /^Claude Sonnet 4\.6\b/ }).click();
    await expect(page.getByText(/Active model/)).toBeVisible();

    // Reload page
    await page.reload();
    await mockSandboxes(page);

    // Navigate back to settings tab
    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    // Model still selected
    await expect(page.getByText(/Active model/)).toBeVisible();
    await expect(page.getByTestId("active-model-id")).toHaveText("claude-sonnet-4-6");
  });

  test("toggling a selected model deselects it", async ({ page }) => {
    await seedAgent(page, "claude-sonnet-4-6");
    await mockSandboxes(page);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    // Model is pre-selected
    await expect(page.getByText(/Active model/)).toBeVisible();

    // Click the same model to deselect
    await page.getByRole("button", { name: /^Claude Sonnet 4\.6\b/ }).click();

    // Falls back to "using gateway default"
    await expect(page.getByText(/using gateway default/)).toBeVisible();
  });

  test("apply & restart reconfigures provider and switches to the provider default model", async ({ page }) => {
    await seedAgent(page, "claude-sonnet-4-6");
    await mockSandboxes(page);

    const reconfigureBodyPromise = mockReconfigure(page);

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    await page.getByRole("button", { name: "OpenAI / Codex" }).click();
    await page.getByLabel("OpenAI API Key").fill("sk-openai-secret-1234");
    await page.getByRole("button", { name: "Apply & Restart" }).click();

    const reconfigureBody = await reconfigureBodyPromise;
    expect(reconfigureBody.provider).toBe("openai");
    expect(reconfigureBody.apiKey).toBe("sk-openai-secret-1234");
    expect(reconfigureBody.model).toBe("gpt-4o");

    await expect(page.getByText(/Provider applied/i)).toBeVisible();
    await expect(page.getByTestId("active-model-id")).toHaveText("gpt-4o");
  });

  test("shared Codex sandboxes clear stale local models and disable provider reconfigure", async ({ page }) => {
    await seedAgent(page, "claude-sonnet-4-6");
    await mockSandboxes(page, {
      sharedCodexEnabled: true,
      sharedCodexModel: "openai-codex/gpt-5.4",
    });

    await page.goto(`/agents/${AGENT_ID}/chat?tab=settings`);

    await expect(page.getByText(/Shared Codex is managing this sandbox/i)).toBeVisible();
    await expect(page.getByTestId("active-model-id")).toHaveText("openai-codex/gpt-5.4");
    await expect(page.getByRole("button", { name: "Managed by Shared Codex" })).toBeDisabled();
    await expect(page.getByText(/using gateway default/i)).not.toBeVisible();

    const storedState = await page.evaluate((agentId) => {
      const raw = localStorage.getItem("openclaw-agents");
      return raw ? JSON.parse(raw) : null;
    }, AGENT_ID);
    expect(
      storedState?.state?.agents?.find((agent: { id: string }) => agent.id === AGENT_ID)?.model,
    ).toBeUndefined();
  });
});

test.describe("TabSettings — model pass-through to API", () => {
  test("chat request body includes selected model", async ({ page }) => {
    await seedAgent(page, "claude-sonnet-4-6");
    await mockSandboxes(page);
    await mockMessages(page);

    // Set up chat capture before navigation
    const chatBodyPromise = mockChat(page);
    const convBodyPromise = mockConversationCreate(page);

    await page.goto(`/agents/${AGENT_ID}/chat`);

    // Send a message
    const input = page.getByPlaceholder(/message/i).or(page.locator("textarea")).first();
    await input.fill("Hello agent");
    await page.keyboard.press("Enter");

    // Verify conversation creation included the model
    const convBody = await convBodyPromise;
    expect(convBody.model).toBe("claude-sonnet-4-6");

    // Verify chat request included the model
    const chatBody = await chatBodyPromise;
    expect(chatBody.model).toBe("claude-sonnet-4-6");
  });

  test("falls back to openclaw-default when no model is selected", async ({ page }) => {
    await seedAgent(page); // no model
    await mockSandboxes(page);
    await mockMessages(page);

    const chatBodyPromise = mockChat(page);
    const convBodyPromise = mockConversationCreate(page);

    await page.goto(`/agents/${AGENT_ID}/chat`);

    const input = page.getByPlaceholder(/message/i).or(page.locator("textarea")).first();
    await input.fill("Hello agent");
    await page.keyboard.press("Enter");

    const convBody = await convBodyPromise;
    expect(convBody.model).toBe("openclaw-default");

    const chatBody = await chatBodyPromise;
    expect(chatBody.model).toBe("openclaw-default");
  });

  test("shared Codex sandboxes always send openclaw-default for new chats", async ({ page }) => {
    await seedAgent(page, "claude-sonnet-4-6");
    await mockSandboxes(page, {
      sharedCodexEnabled: true,
      sharedCodexModel: "openai-codex/gpt-5.4",
    });
    await mockMessages(page);

    const chatBodyPromise = mockChat(page);
    const convBodyPromise = mockConversationCreate(page);

    await page.goto(`/agents/${AGENT_ID}/chat`);

    const input = page.getByPlaceholder(/message/i).or(page.locator("textarea")).first();
    await input.fill("Hello shared Codex");
    await page.keyboard.press("Enter");

    const convBody = await convBodyPromise;
    expect(convBody.model).toBe("openclaw-default");

    const chatBody = await chatBodyPromise;
    expect(chatBody.model).toBe("openclaw-default");
  });
});
