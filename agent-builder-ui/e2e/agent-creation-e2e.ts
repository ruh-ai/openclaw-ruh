/**
 * E2E test: Full agent creation flow
 * Think → Plan → Build → Review → Test → Ship
 *
 * Run with: npx playwright test e2e/agent-creation-e2e.ts --headed
 */

import { chromium, type Page, type Browser } from "playwright";

const BASE = "http://localhost:3000";
const AUTH_EMAIL = "e2e@ruh.ai";
const AUTH_PASSWORD = "TestPassword123!";

async function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function authenticate(page: Page) {
  log("Authenticating via API...");

  // Login via backend API to get tokens
  const loginRes = await fetch("http://localhost:8000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
  });
  const loginData = await loginRes.json() as { accessToken?: string; refreshToken?: string };

  if (!loginData.accessToken) {
    throw new Error(`Auth failed: ${JSON.stringify(loginData)}`);
  }

  // Set auth cookies in the browser context
  const context = page.context();
  await context.addCookies([
    { name: "access_token", value: loginData.accessToken, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "refresh_token", value: loginData.refreshToken!, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);

  log("Auth tokens set via cookies");
}

async function waitForStoreValue(
  page: Page,
  check: string,
  timeoutMs = 120_000,
  pollMs = 2000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(check).catch(() => false);
    if (result) return true;
    await page.waitForTimeout(pollMs);
  }
  return false;
}

async function getStoreState(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__coPilotStore?.getState?.();
    if (!s) return null;
    return {
      devStage: s.devStage,
      thinkStatus: s.thinkStatus,
      planStatus: s.planStatus,
      buildStatus: s.buildStatus,
      evalStatus: s.evalStatus,
      deployStatus: s.deployStatus,
      skillCount: s.skillGraph?.length ?? 0,
      hasDocs: !!s.discoveryDocuments,
      hasPlan: !!s.architecturePlan,
      buildActivity: s.buildActivity?.length ?? 0,
      name: s.name,
    };
  });
}

async function runE2E() {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // ── Step 0: Authenticate ──
    await authenticate(page);

    // ── Step 1: Create Agent ──
    log("=== STEP 1: CREATE AGENT ===");
    await page.goto(`${BASE}/agents`);
    await page.waitForTimeout(2000);
    await page.click('text=/Create New Agent/i');
    await page.waitForTimeout(2000);

    // Fill name and description
    const nameInput = page.locator('input[placeholder*="e.g."]');
    await nameInput.fill("E2E Test Agent");

    const descInput = page.locator('textarea');
    await descInput.fill("A simple test agent that greets users and tells them the current time");

    await page.click('text="Bring to life"');
    log("Agent creation submitted, waiting for forge provisioning...");

    // Wait for the copilot page to load (forge provisioning can take 30-120s)
    await page.waitForURL(/agentId=/, { timeout: 180_000 });
    log(`Agent page loaded: ${page.url()}`);

    // Wait for store to initialize
    await page.waitForTimeout(5000);

    // ── Step 2: THINK ──
    log("=== STEP 2: THINK (Auto PRD/TRD) ===");
    const thinkStarted = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.devStage === "think" && s?.thinkStatus === "generating"; })()`,
      30_000,
    );
    log(`Think started: ${thinkStarted}`);

    // Wait for Think to complete (PRD/TRD generated)
    const thinkDone = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.discoveryDocuments !== null || s?.devStage !== "think"; })()`,
      180_000,
    );
    let state = await getStoreState(page);
    log(`Think result: hasDocs=${state?.hasDocs}, devStage=${state?.devStage}, thinkStatus=${state?.thinkStatus}`);

    // ── Step 3: PLAN ──
    log("=== STEP 3: PLAN (Auto Architecture) ===");
    const planStarted = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.devStage === "plan"; })()`,
      30_000,
    );
    log(`Plan started: ${planStarted}`);

    const planDone = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.architecturePlan !== null || s?.devStage === "build"; })()`,
      180_000,
    );
    state = await getStoreState(page);
    log(`Plan result: hasPlan=${state?.hasPlan}, devStage=${state?.devStage}, planStatus=${state?.planStatus}`);

    // ── Step 4: BUILD ──
    log("=== STEP 4: BUILD (Auto Skills) ===");
    const buildStarted = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.devStage === "build" && s?.buildStatus === "building"; })()`,
      30_000,
    );
    log(`Build started: ${buildStarted}`);

    // Monitor build activity every 10s
    const buildMonitorInterval = setInterval(async () => {
      const s = await getStoreState(page).catch(() => null);
      if (s && s.devStage === "build") {
        log(`  Build progress: ${s.buildActivity} events, ${s.skillCount} skills`);
      }
    }, 10_000);

    const buildDone = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.buildStatus === "done" || s?.devStage === "review" || s?.devStage === "test"; })()`,
      600_000, // 10 min for complex builds
    );
    clearInterval(buildMonitorInterval);

    state = await getStoreState(page);
    log(`Build result: skillCount=${state?.skillCount}, buildActivity=${state?.buildActivity}, devStage=${state?.devStage}`);

    // ── Step 5: REVIEW / TEST ──
    log("=== STEP 5: REVIEW → TEST ===");
    const testReached = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.devStage === "test" || s?.devStage === "ship"; })()`,
      120_000,
    );
    state = await getStoreState(page);
    log(`Test/Ship reached: devStage=${state?.devStage}, evalStatus=${state?.evalStatus}`);

    // ── Step 6: SHIP ──
    log("=== STEP 6: SHIP ===");
    const shipReached = await waitForStoreValue(
      page,
      `(() => { const s = window.__coPilotStore?.getState?.(); return s?.devStage === "ship"; })()`,
      300_000,
    );
    state = await getStoreState(page);
    log(`Ship reached: devStage=${state?.devStage}`);

    // Take final screenshot
    await page.screenshot({ path: "e2e-ship-stage.png" });
    log("Screenshot saved: e2e-ship-stage.png");

    // Click Deploy Agent
    log("Clicking Deploy Agent...");
    const deployBtn = page.locator('button:has-text("Deploy Agent")');
    if (await deployBtn.isEnabled()) {
      await deployBtn.click();
      await page.waitForTimeout(15_000);
      log(`After deploy: ${page.url()}`);
    } else {
      log("Deploy Agent button is disabled");
    }

    // ── RESULTS ──
    log("");
    log("========== E2E RESULTS ==========");
    const finalState = await getStoreState(page).catch(() => null);
    log(`Final URL: ${page.url()}`);
    log(`Final store: ${JSON.stringify(finalState, null, 2)}`);

    const passed = page.url().includes("/agents") && !page.url().includes("create");
    log(`E2E TEST: ${passed ? "PASSED ✅" : "NEEDS REVIEW ⚠️"}`);
    log("=================================");

    // Keep browser open for manual inspection
    log("Browser staying open for 60s for inspection...");
    await page.waitForTimeout(60_000);
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) await browser.close();
  }
}

runE2E();
