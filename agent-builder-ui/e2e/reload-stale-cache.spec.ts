/**
 * E2E for the 935d01d0… reload bug — verifies backend content wins over
 * a stale localStorage cache on page reload after the architect revises
 * a workspace artifact.
 *
 * Steps simulated:
 *   1. Pre-populate Zustand-persist localStorage (openclaw-agents) with
 *      a stale agents[] entry. This is what hydrates synchronously on
 *      page mount before any fetch resolves.
 *   2. Pre-populate the create-session-cache localStorage entry with a
 *      stale copilot snapshot. This is what buildResumedCoPilotSeed
 *      merges over the persistedSeed.
 *   3. Mock /api/agents/<id> to return the FRESH revised content.
 *   4. Navigate to /agents/create?agentId=<id>.
 *   5. Verify the rendered store reflects the FRESH backend content,
 *      not the stale cache.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const APP_ORIGIN = "http://localhost:3000";
const AGENT_ID = "test-reload-agent-1";
const SANDBOX_ID = "sandbox-reload-1";

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

// Stale content — what the user would see if the cache wins
const STALE_PRD_SECTION = { heading: "Architecture Overview", content: "SQLite-based local storage." };
const STALE_TRD_SECTION = { heading: "Architecture Overview", content: "SQLite-based storage." };

// Fresh content — what the architect wrote on disk + backend record
const FRESH_PRD_SECTION = { heading: "Architecture Overview", content: "PostgreSQL-based storage." };
const FRESH_TRD_SECTION = { heading: "Architecture Overview", content: "PostgreSQL-based storage." };

const FRESH_AGENT_RECORD = {
  id: AGENT_ID,
  name: "Reload Test Agent",
  avatar: "🤖",
  description: "Agent used for reload-stale-cache E2E.",
  status: "forging",
  forge_stage: "think",
  forge_sandbox_id: SANDBOX_ID,
  sandbox_ids: [SANDBOX_ID],
  skills: [],
  agent_rules: [],
  runtime_inputs: [],
  tool_connections: [],
  triggers: [],
  channels: [],
  improvements: [],
  workspace_memory: { instructions: "", continuity_summary: "", pinned_paths: [], updated_at: null },
  creation_session: null,
  created_at: "2026-05-10T20:00:00.000Z",
  updated_at: "2026-05-10T22:25:00.000Z",
  discovery_documents: {
    prd: {
      title: "Product Requirements Document",
      sections: [FRESH_PRD_SECTION],
    },
    trd: {
      title: "Technical Requirements Document",
      sections: [FRESH_TRD_SECTION],
    },
  },
  skill_graph: null,
  workflow: null,
  agentBuiltWith: null,
  agent_built_with: null,
};

async function mockStack(page: Page) {
  await page.context().addCookies([
    { name: "accessToken", value: "test-access-token", url: APP_ORIGIN },
    { name: "refreshToken", value: "test-refresh-token", url: APP_ORIGIN },
  ]);

  await page.route(`${API_BASE}/users/me`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTHENTICATED_USER) }),
  );
  await page.route(`${API_BASE}/api/auth/me`, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_SESSION) }),
  );
  await page.route(`${API_BASE}/api/auth/github/status`, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: true, username: "test-user" }),
    }),
  );

  // Fresh backend agent record
  await page.route(/\/api\/agents\/[^/?]+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FRESH_AGENT_RECORD),
    });
  });
  await page.route(/\/api\/agents(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );

  // Forge sandbox endpoints
  await page.route(/\/api\/agents\/[^/]+\/forge(\?|$)/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        forge_sandbox_id: SANDBOX_ID,
        status: "ready",
        sandbox: { sandbox_id: SANDBOX_ID, sandbox_name: "forge", gateway_port: 18789, vnc_port: 6080 },
      }),
    }),
  );
  await page.route(/\/api\/sandboxes\/[^/?]+(\?|$)/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sandbox_id: SANDBOX_ID,
        sandbox_name: "forge",
        gateway_port: 18789,
        vnc_port: 6080,
        approved: true,
      }),
    }),
  );

  // Conversations + workspace file reads — empty
  await page.route(/\/api\/conversations(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/api\/agents\/[^/]+\/conversations(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  for (const ws of ["workspace-copilot", "workspace"]) {
    await page.route(
      new RegExp(`/api/sandboxes/[^/]+/${ws}/file\\?`),
      async (route: Route) =>
        route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );
  }
}

test.describe("Reload after stale cache (935d01d0… repro)", () => {
  test("backend's freshly-revised discoveryDocuments wins over stale localStorage cache", async ({ page }) => {
    await mockStack(page);

    // Pre-populate BOTH cache layers with stale content before the page
    // mounts. addInitScript runs in every navigation in this context,
    // so the storage is in place before the bundle hydrates.
    await page.addInitScript(({ agentId, stalePrd, staleTrd }) => {
      const staleAgent = {
        id: agentId,
        name: "Reload Test Agent",
        avatar: "🤖",
        description: "Agent used for reload-stale-cache E2E.",
        skills: [],
        triggerLabel: "",
        agentRules: [],
        sandboxIds: ["sandbox-reload-1"],
        forgeSandboxId: "sandbox-reload-1",
        forgeStage: "think",
        skillGraph: null,
        workflow: null,
        improvements: [],
        runtimeInputs: [],
        toolConnections: [],
        triggers: [],
        channels: [],
        status: "forging",
        createdAt: "2026-05-10T20:00:00.000Z",
        updatedAt: "2026-05-10T21:49:34.000Z",
        // Stale content — pre-revision
        discoveryDocuments: {
          prd: { title: "PRD", sections: [stalePrd] },
          trd: { title: "TRD", sections: [staleTrd] },
        },
      };

      // Zustand persist for useAgentsStore
      localStorage.setItem("openclaw-agents", JSON.stringify({
        state: { agents: [staleAgent], isLoading: false },
        version: 0,
      }));

      // create-session-cache for the agent (the other stale cache)
      localStorage.setItem(`copilot-create-session:${agentId}`, JSON.stringify({
        version: 4,
        timestamp: Date.now() - 60_000,
        coPilot: {
          name: "Reload Test Agent",
          description: "Agent used for reload-stale-cache E2E.",
          devStage: "think",
          thinkStatus: "ready",
          discoveryDocuments: {
            prd: { title: "PRD", sections: [stalePrd] },
            trd: { title: "TRD", sections: [staleTrd] },
          },
        },
        builder: {},
      }));
    }, { agentId: AGENT_ID, stalePrd: STALE_PRD_SECTION, staleTrd: STALE_TRD_SECTION });

    // Navigate to the create page with the existing agent id.
    await page.goto(`/agents/create?agentId=${AGENT_ID}`);

    // Wait for the copilot store to be exposed (CoPilotLayout mounted).
    await expect.poll(async () =>
      page.evaluate(() => {
        const w = window as unknown as { __coPilotStore?: unknown };
        return Boolean(w.__coPilotStore);
      }),
      { timeout: 25_000, intervals: [300] },
    ).toBe(true);

    // Then wait for the discoveryDocuments to be hydrated (the seed effect
    // may run twice — once with stale, once with fresh — so we poll for
    // the FRESH content rather than just non-null).
    await expect.poll(async () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __coPilotStore?: { getState?: () => { discoveryDocuments?: { prd?: { sections?: Array<{ content?: string }> } } } };
        };
        return w.__coPilotStore?.getState?.()?.discoveryDocuments?.prd?.sections?.[0]?.content ?? null;
      }),
      { timeout: 15_000, intervals: [300] },
    ).toBe("PostgreSQL-based storage.");

    // Sanity: confirm TRD also got the fresh content (same fix path).
    const trdContent = await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: { getState?: () => { discoveryDocuments?: { trd?: { sections?: Array<{ content?: string }> } } } };
      };
      return w.__coPilotStore?.getState?.()?.discoveryDocuments?.trd?.sections?.[0]?.content;
    });
    expect(trdContent).toBe("PostgreSQL-based storage.");
  });
});
