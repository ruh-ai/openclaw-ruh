/**
 * E2E coverage for the artifact-refresh post-revision useEffect.
 *
 * Verifies the fixes from 11c6f80 + 9126913 — when the architect's turn
 * completes in builder mode, the matching workspace file(s) are re-read
 * and the co-pilot store is updated. Without this, the architect can
 * write a revised PRD.md to disk and the UI keeps showing the stale
 * pre-revision version.
 *
 * Covers:
 *   1. Explicit selectedArtifactTarget (user clicked "Ask architect to
 *      revise PRD") triggers PRD.md + TRD.md refetch.
 *   2. Free-form revision in Think stage (no explicit target) falls back
 *      to stage-derived default and still refetches PRD.md + TRD.md.
 *   3. Free-form revision in Plan stage refetches architecture.json.
 *   4. Stages with no architect-owned artifact (reveal/test/ship) do not
 *      hit any workspace/file endpoint.
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
  return events
    .flatMap(({ event, data }) => [`event: ${event}`, `data: ${JSON.stringify(data)}`, ""])
    .join("\n");
}

// Track every read of workspace files so tests can assert which paths
// were refetched after a turn. Each entry: { path, workspace }.
let workspaceFileReads: Array<{ workspace: "copilot" | "main"; path: string }> = [];

interface MockOpts {
  // Content to return from workspace file reads (per path). Default: empty.
  workspaceFiles?: Record<string, string>;
  // Hold the architect SSE response until release() is called.
  hold?: boolean;
}

let releaseHold: (() => void) | null = null;
let holdPromise: Promise<void> | null = null;

function armHold() {
  holdPromise = new Promise<void>((resolve) => { releaseHold = resolve; });
}

function releaseHoldNow() { releaseHold?.(); }

async function mockStack(page: Page, opts: MockOpts = {}) {
  workspaceFileReads = [];
  if (opts.hold) armHold();

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

  // Architect bridge — hold until release if requested, then complete.
  await page.route("**/api/openclaw", async (route: Route) => {
    if (opts.hold && holdPromise) await holdPromise;
    if (opts.hold) armHold();
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

  await page.route(/\/api\/agents\/[^/]+\/forge\/stream\/[^/?]+/, async (route: Route) =>
    route.fulfill({
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
    }),
  );

  await page.route(/\/api\/agents\/[^/]+\/forge(\?|$)/, async (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        forge_sandbox_id: "sandbox-1",
        status: "ready",
        sandbox: { sandbox_id: "sandbox-1", sandbox_name: "forge", gateway_port: 18789, vnc_port: 6080 },
      }),
    }),
  );

  await page.route(/\/api\/agents(\?|$)/, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else { await route.fallback(); }
  });

  await page.route(/\/api\/agents\/[^/?]+(\?|$)/, async (route: Route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/api/agents/")[1].split("/")[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id, name: "Test Agent", forge_sandbox_id: "sandbox-1", status: "forging" }),
    });
  });

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

  // Workspace file reads — record every hit + serve from opts.workspaceFiles.
  const filesByPath = opts.workspaceFiles ?? {};
  for (const ws of ["workspace-copilot", "workspace"] as const) {
    await page.route(
      new RegExp(`/api/sandboxes/[^/]+/${ws}/file\\?`),
      async (route: Route) => {
        const url = new URL(route.request().url());
        const path = url.searchParams.get("path") ?? "";
        workspaceFileReads.push({ workspace: ws === "workspace-copilot" ? "copilot" : "main", path });
        const content = filesByPath[path];
        if (content !== undefined) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ content }),
          });
        } else {
          await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
        }
      },
    );
  }

  // Conversations — empty.
  await page.route(/\/api\/conversations(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/api\/agents\/[^/]+\/conversations(\?|$)/, async (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

async function startNewAgent(page: Page, name = "Refresh Test Agent") {
  await page.goto("/agents/create");
  await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("e.g. Google Ads Manager").fill(name);
  await page.getByRole("button", { name: /Bring to life/i }).click();
  await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 10_000 });
}

interface CoPilotStoreHandle {
  setDevStage?: (stage: string) => void;
  setRevealStatus?: (status: string) => void;
  setAgentSandboxId?: (id: string) => void;
  setSelectedArtifactTarget?: (target: { kind: string } | null) => void;
  setDiscoveryDocuments?: (docs: unknown) => void;
  setArchitecturePlan?: (plan: unknown) => void;
}

async function jumpToStage(
  page: Page,
  stage: "think" | "plan" | "build",
  seed: (store: CoPilotStoreHandle) => void = () => {},
) {
  await expect
    .poll(async () =>
      page.evaluate(([targetStage, seedFn]) => {
        const w = window as unknown as { __coPilotStore?: { getState?: () => CoPilotStoreHandle } };
        const store = w.__coPilotStore?.getState?.();
        if (!store?.setDevStage) return false;
        store.setRevealStatus?.("approved");
        store.setDevStage(targetStage as string);
        store.setAgentSandboxId?.("sandbox-1");
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const seedImpl = new Function("store", `(${seedFn})(store)`);
        seedImpl(store);
        return true;
      }, [stage, seed.toString()] as [string, string]),
    )
    .toBe(true);
}

async function sendChat(page: Page, text: string) {
  const textarea = page.locator("textarea:visible").first();
  await textarea.waitFor({ state: "visible", timeout: 10_000 });
  await textarea.fill(text);
  const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
  await expect(sendButton).not.toBeDisabled({ timeout: 5_000 });
  await sendButton.click();
}

const PRD_SAMPLE = [
  "# Product Requirements Document",
  "",
  "## Problem Statement",
  "Original problem text.",
  "",
  "## Target Users",
  "Original users.",
].join("\n");

const PRD_REVISED = [
  "# Product Requirements Document",
  "",
  "## Problem Statement",
  "Revised problem — now mentions PostgreSQL.",
  "",
  "## Target Users",
  "Revised users.",
].join("\n");

const TRD_SAMPLE = [
  "# Technical Requirements Document",
  "",
  "## Architecture Overview",
  "SQLite-based local storage.",
  "",
  "## API Surface",
  "REST endpoints over JSON.",
].join("\n");

const TRD_REVISED = [
  "# Technical Requirements Document",
  "",
  "## Architecture Overview",
  "PostgreSQL-based storage.",
  "",
  "## API Surface",
  "REST endpoints over JSON.",
].join("\n");

const ARCHITECTURE_SAMPLE = JSON.stringify({
  agent_name: "Refresh Test Agent",
  skills: [{ id: "skill-a", name: "Skill A", description: "first" }],
  workflow: { steps: [] },
});

test.describe("Artifact refresh after architect turn (Phase 1 fix)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("openclaw-agents"));
  });

  test("explicit [target: PRD] revision refetches PRD + TRD from workspace", async ({ page }) => {
    await mockStack(page, {
      workspaceFiles: {
        ".openclaw/discovery/PRD.md": PRD_REVISED,
        ".openclaw/discovery/TRD.md": TRD_REVISED,
      },
    });
    await startNewAgent(page);
    await jumpToStage(page, "think", (store) => {
      // Seed an explicit revise target — the user clicked "Ask architect to revise PRD"
      store.setSelectedArtifactTarget?.({ kind: "prd" });
      // Seed pre-revision discoveryDocuments so the refetch's setDiscoveryDocuments is visible
      store.setDiscoveryDocuments?.({
        prd: { title: "PRD", sections: [{ heading: "Problem Statement", content: "Original problem text." }] },
        trd: { title: "TRD", sections: [{ heading: "Architecture Overview", content: "SQLite-based local storage." }] },
      });
    });

    workspaceFileReads = []; // reset after seeding so we only count post-turn reads
    await sendChat(page, "Update the PRD to use PostgreSQL");

    // Wait for the turn to complete and the refetch to fire.
    await expect
      .poll(() => workspaceFileReads.filter((r) => r.path === ".openclaw/discovery/PRD.md").length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);

    const reads = workspaceFileReads.filter((r) => r.path.startsWith(".openclaw/discovery/"));
    const paths = new Set(reads.map((r) => r.path));
    expect(paths.has(".openclaw/discovery/PRD.md")).toBe(true);
    expect(paths.has(".openclaw/discovery/TRD.md")).toBe(true);

    // Confirm the store actually got the revised content
    const stored = await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: { getState?: () => { discoveryDocuments?: { prd?: { sections?: Array<{ content?: string }> } } } };
      };
      return w.__coPilotStore?.getState?.()?.discoveryDocuments?.prd?.sections?.[0]?.content;
    });
    expect(stored).toContain("PostgreSQL");
  });

  test("free-form revision in Think stage (no explicit target) refetches PRD + TRD via stage default", async ({ page }) => {
    await mockStack(page, {
      workspaceFiles: {
        ".openclaw/discovery/PRD.md": PRD_REVISED,
        ".openclaw/discovery/TRD.md": TRD_REVISED,
      },
    });
    await startNewAgent(page);
    await jumpToStage(page, "think", (store) => {
      // Critical: no setSelectedArtifactTarget — this is the bug class
      // (free-form chat like "change sqlite to postgresql" without
      // clicking the revise button).
      store.setDiscoveryDocuments?.({
        prd: { title: "PRD", sections: [{ heading: "Problem Statement", content: "Original problem text." }] },
        trd: { title: "TRD", sections: [{ heading: "Architecture Overview", content: "SQLite-based local storage." }] },
      });
    });

    workspaceFileReads = [];
    await sendChat(page, "Switch the persistence layer to PostgreSQL");

    await expect
      .poll(() => workspaceFileReads.filter((r) => r.path === ".openclaw/discovery/PRD.md").length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);

    const paths = new Set(workspaceFileReads.map((r) => r.path));
    expect(paths.has(".openclaw/discovery/PRD.md")).toBe(true);
    expect(paths.has(".openclaw/discovery/TRD.md")).toBe(true);

    // Store updated even without the explicit target
    const stored = await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: { getState?: () => { discoveryDocuments?: { trd?: { sections?: Array<{ content?: string }> } } } };
      };
      return w.__coPilotStore?.getState?.()?.discoveryDocuments?.trd?.sections?.[0]?.content;
    });
    expect(stored).toContain("PostgreSQL");
  });

  test("free-form revision in Plan stage refetches architecture.json", async ({ page }) => {
    await mockStack(page, {
      workspaceFiles: {
        ".openclaw/plan/architecture.json": ARCHITECTURE_SAMPLE,
      },
    });
    await startNewAgent(page);
    await jumpToStage(page, "plan");

    workspaceFileReads = [];
    await sendChat(page, "Add a logging skill to the plan");

    await expect
      .poll(() => workspaceFileReads.filter((r) => r.path === ".openclaw/plan/architecture.json").length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);

    // Should not have touched discovery files for a plan-stage revision
    const discoveryReads = workspaceFileReads.filter((r) => r.path.startsWith(".openclaw/discovery/"));
    expect(discoveryReads.length).toBe(0);
  });

  test("stages without architect-owned artifacts do not fire workspace fetches", async ({ page }) => {
    await mockStack(page, { workspaceFiles: {} });
    await startNewAgent(page);
    // Test stage has no canonical architect-owned file → defaultArtifactForStage returns null
    await jumpToStage(page, "build" as "think" | "plan" | "build");
    // Override to a stage that returns null. Build is closer than test
    // but does have a stage-default; cycle to test via a second setDevStage.
    await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: { getState?: () => { setDevStage?: (s: string) => void } };
      };
      w.__coPilotStore?.getState?.()?.setDevStage?.("test");
    });

    workspaceFileReads = [];
    await sendChat(page, "Run the eval");

    // Give the page time to potentially fetch — verify it didn't.
    await page.waitForTimeout(800);
    expect(workspaceFileReads.length).toBe(0);
  });
});

test.describe("Stage status reconciliation after revision", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("openclaw-agents"));
  });

  // Repro of the "stuck thinking" bug — when a revision turn lands in
  // Think stage, builder-agent.ts emits think_status: generating at turn
  // start. Revision turns don't emit <think_document_ready>, so
  // thinkStatus stays at "generating" after the turn ends and
  // LifecycleStepRenderer keeps rendering ThinkActivityPanel forever.
  // After the fix, the post-turn useEffect resets thinkStatus to "ready"
  // when discoveryDocuments are present.
  test("Think stage: stuck thinkStatus=generating is reset to ready on falling edge of isLoading", async ({ page }) => {
    await mockStack(page, {
      workspaceFiles: {
        ".openclaw/discovery/PRD.md": PRD_REVISED,
        ".openclaw/discovery/TRD.md": TRD_REVISED,
      },
    });
    await startNewAgent(page);
    await jumpToStage(page, "think", (store) => {
      store.setDiscoveryDocuments?.({
        prd: { title: "PRD", sections: [{ heading: "Problem Statement", content: "Existing." }] },
        trd: { title: "TRD", sections: [{ heading: "Architecture Overview", content: "Existing." }] },
      });
    });

    // Simulate the builder-agent flipping thinkStatus to "generating"
    // at turn start (what happens when user submits a chat in Think
    // stage). This is the precondition for the stuck-thinking bug.
    await page.evaluate(() => {
      const w = window as unknown as {
        __coPilotStore?: { getState?: () => { setThinkStatus?: (s: string) => void } };
      };
      w.__coPilotStore?.getState?.()?.setThinkStatus?.("generating");
    });

    await sendChat(page, "Tweak the PRD wording");

    // After the turn completes, thinkStatus must return to "ready"
    // because discoveryDocuments is already present — the stage IS
    // ready, it can't be "generating".
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __coPilotStore?: { getState?: () => { thinkStatus?: string } };
            };
            return w.__coPilotStore?.getState?.()?.thinkStatus ?? null;
          }),
        { timeout: 10_000 },
      )
      .toBe("ready");
  });

  // Plan-stage equivalent of the Think test above. Skipped from automated
  // E2E because the synthetic harness can't reliably render the chat input
  // when planStatus is pre-set to "generating" (the page gates the input
  // on additional plan-stage state we don't seed here). The reset logic in
  // TabChat's post-turn useEffect is symmetric for thinkStatus and
  // planStatus, so the Think test above provides the structural coverage.
  // Manual repro: in Plan stage, send a revision; planStatus stays
  // "generating" without the fix.
});

test.describe("Architect turn abnormal termination", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("openclaw-agents"));
  });

  // Repros the 22:18 incident pattern: architect WS drops mid-turn. The
  // bridge surfaces the close as an SSE error event. The UI's isLoading
  // should flip false within a reasonable window so the user can submit
  // again — not stick at "thinking" forever.
  test("UI recovers when architect SSE returns an error event mid-turn", async ({ page }) => {
    await mockStack(page);

    // Override the architect route AFTER mockStack so this test's
    // version takes precedence — emit an error event in the SSE stream
    // and close. Matches what the bridge does on a gateway WS drop.
    await page.unroute("**/api/openclaw");
    await page.route("**/api/openclaw", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: buildSseResponse([
          { event: "status", data: { phase: "thinking", message: "Agent thinking..." } },
          {
            event: "result",
            data: {
              type: "error",
              error: "gateway_closed_mid_turn",
              content: "WebSocket closed after agent run started",
            },
          },
        ]),
      });
    });

    await startNewAgent(page);
    await jumpToStage(page, "think");

    await sendChat(page, "Make a change that the architect can't finish");

    // After an error-typed result, the chat panel should NOT remain in a
    // permanent loading state. We poll the input enabled state because
    // it's the most user-facing signal — if it's clickable, the user
    // can recover.
    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    const textarea = page.locator("textarea:visible").first();
    await textarea.fill("Retry");

    await expect(sendButton).not.toBeDisabled({ timeout: 10_000 });
  });

  // SSE stream ends with no result event at all — older bridge bug. The
  // useAgentChat hook's `if (!finalResult)` path should still clear
  // isLoading rather than hang.
  test("UI recovers when architect SSE ends with no result event", async ({ page }) => {
    await mockStack(page);

    await page.unroute("**/api/openclaw");
    await page.route("**/api/openclaw", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        // Just status + delta, no result. Mirrors the 22:18 case where
        // the WS dropped before chat.state=final fired.
        body: buildSseResponse([
          { event: "status", data: { phase: "thinking", message: "Agent thinking..." } },
          { event: "delta", data: { text: "partial..." } },
        ]),
      });
    });

    await startNewAgent(page);
    await jumpToStage(page, "think");

    await sendChat(page, "Trigger a half-finished turn");

    const sendButton = page.locator("button").filter({ has: page.locator("svg.lucide-send") });
    const textarea = page.locator("textarea:visible").first();
    await textarea.fill("Retry");

    await expect(sendButton).not.toBeDisabled({ timeout: 10_000 });
  });
});

// Silence unused-import warnings for hold helpers (kept for future tests).
void releaseHoldNow;
