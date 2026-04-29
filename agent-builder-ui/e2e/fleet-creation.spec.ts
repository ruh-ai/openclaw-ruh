/**
 * LIVE E2E: Multi-agent fleet creation (Path B Slices 1–4).
 *
 * Validates that when the user describes work that clearly partitions across
 * multiple roles, the architect emits a `subAgents` fleet (with at least one
 * `orchestrator`) and the build pipeline decomposes per-agent (writing
 * identity files under `agents/<id>/`).
 *
 * Hits real infra: backend, sandbox container, architect LLM.
 * Run explicitly:
 *   cd agent-builder-ui && npx playwright test e2e/fleet-creation.spec.ts
 *
 * Prereqs: backend (8000) and builder (3000) up; Docker running with sandbox
 * image; LLM key configured in ruh-backend/.env.
 */

import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.setTimeout(900_000); // 15 min — fleet plans are heavier than single-agent

const API_BASE = "http://localhost:8000";

interface SubAgent {
  id: string;
  name: string;
  type: string;
  skills?: string[];
  autonomy?: string;
}

function dockerExec(containerName: string, cmd: string): string {
  try {
    return execSync(`docker exec ${containerName} sh -c ${JSON.stringify(cmd)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

async function getAgent(agentId: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

test.describe("Live Fleet Creation — multiagent + orchestrator E2E", () => {
  test("architect elicits a fleet → build decomposes per-agent", async ({ page }) => {
    // ── Login (real auth) ──────────────────────────────────────────────
    console.log("[1/6] Logging in…");
    const loginRes = await page.request.post(`${API_BASE}/api/auth/login`, {
      data: { email: "prasanjit@ruh.ai", password: "RuhTest123" },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    expect(loginData.accessToken).toBeTruthy();
    const accessToken = loginData.accessToken as string;

    await page.context().addCookies([
      { name: "accessToken", value: accessToken, url: "http://localhost:3000" },
      { name: "refreshToken", value: loginData.refreshToken, url: "http://localhost:3000" },
    ]);
    console.log("  ✓ Logged in");

    // ── Create agent with a description that clearly partitions roles ──
    console.log("[2/6] Submitting fleet-shaped agent description…");
    await page.goto("http://localhost:3000/agents/create");
    await expect(page.getByText("Who are you bringing to life?")).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder("e.g. Google Ads Manager").fill("Ad Operations Fleet");

    const description = [
      "An ad operations team for managing Google Ads campaigns. The team has three distinct roles working together:",
      "1. A Research Agent that scans competitor ads daily, summarises trends, and writes reports to a shared Postgres.",
      "2. A Creative Writer Agent that reads the research reports and drafts new ad copy variations into the same database.",
      "3. A Publisher Agent that takes approved ad drafts and pushes them to the Google Ads API on a schedule.",
      "An Orchestrator agent coordinates the three: it decides daily what each does, routes hand-offs between them, and surfaces approvals to the human operator.",
      "Single shared Postgres for state. One dashboard showing per-role status. Each role is a distinct agent with its own skills.",
    ].join("\n\n");
    await page.locator("textarea").first().fill(description);

    await page.getByRole("button", { name: /Bring to life/i }).click();
    await expect(page).toHaveURL(/\/agents\/create\?agentId=/, { timeout: 30_000 });
    const agentId = page.url().match(/agentId=([^&]+)/)?.[1] ?? "";
    expect(agentId).toBeTruthy();
    console.log(`  ✓ Agent created: ${agentId}`);

    // Trigger sandbox provisioning via API (UI flow may not auto-trigger reliably).
    console.log("[2b] Triggering forge sandbox provisioning…");
    const forgeRes = await fetch(`${API_BASE}/api/agents/${agentId}/forge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    expect(forgeRes.ok, `forge POST failed: ${forgeRes.status}`).toBeTruthy();
    const forgeBody = (await forgeRes.json()) as { stream_id?: string; forge_sandbox_id?: string };
    if (forgeBody.forge_sandbox_id) {
      console.log(`  ✓ Forge sandbox already exists: ${forgeBody.forge_sandbox_id}`);
    } else if (forgeBody.stream_id) {
      console.log(`  ✓ Forge stream started: ${forgeBody.stream_id}`);
      // Open the SSE stream so the backend actually runs createOpenclawSandbox.
      // We use page.request so the cookies are attached; we don't need the body.
      page.request
        .get(`${API_BASE}/api/agents/${agentId}/forge/stream/${forgeBody.stream_id}`, {
          timeout: 600_000,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .catch(() => {
          /* stream may close after sandbox is provisioned */
        });
    }

    // Poll until forge_sandbox_id appears on the agent record (~3 min typical).
    console.log("[2c] Waiting for sandbox to be linked…");
    let sandboxId = "";
    for (let i = 0; i < 80 && !sandboxId; i++) {
      await page.waitForTimeout(5_000);
      const agent = await getAgent(agentId, accessToken);
      if (!agent) continue;
      sandboxId =
        (agent.forge_sandbox_id as string | undefined) ??
        ((agent.sandbox_ids as string[] | undefined) ?? [])[0] ??
        "";
    }
    expect(sandboxId, "sandbox never got linked to agent — provisioning failed").toBeTruthy();
    console.log(`  ✓ Sandbox ready: ${sandboxId}`);

    // ── Drive the architect directly via the backend chat endpoint.
    //    The frontend normally does this via `[PHASE: reveal]` in CoPilotLayout
    //    (see app/(platform)/agents/create/page.tsx ~445), but loading the UI
    //    in this test environment is unreliable (auth-gate WIP). Bypass and
    //    talk to the architect agent directly through the sandbox chat proxy.
    console.log("[3a/6] Triggering architect via direct chat…");
    const sessionId = `architect-${agentId}`;
    const revealPrompt = `[PHASE: reveal]\n\nAgent name: Ad Operations Fleet\n\nAgent description: ${[
      "An ad operations team for managing Google Ads campaigns. Three distinct roles + an orchestrator.",
      "1. A Research Agent that scans competitor ads and writes reports to shared Postgres.",
      "2. A Creative Writer Agent that drafts ad copy variations into the same database.",
      "3. A Publisher Agent that pushes approved drafts to the Google Ads API.",
      "An Orchestrator agent coordinates the three.",
    ].join("\n")}`;

    const chatRes = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-session-key": `agent:architect:${sessionId}`,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        model: "openclaw",
        messages: [{ role: "user", content: revealPrompt }],
        stream: true,
      }),
    });
    expect(chatRes.ok, `chat POST failed: ${chatRes.status}`).toBeTruthy();
    // Drain the SSE stream — the architect runs while we read.
    if (chatRes.body) {
      const reader = chatRes.body.getReader();
      const start = Date.now();
      while (Date.now() - start < 300_000) {
        // 5 min cap on initial reveal turn
        const { done } = await reader.read();
        if (done) break;
      }
      reader.cancel().catch(() => {});
    }
    console.log("  ✓ Reveal phase prompt sent");

    // ── Poll backend until plan locks (forge_stage past 'plan') ────────
    console.log("[3/6] Waiting for Think → Plan to complete…");
    const planLockedStages = new Set(["build", "review", "test", "ship", "complete"]);
    const maxPolls = 100; // 8.5 min @ 5s
    let stage = "think";

    for (let i = 0; i < maxPolls && !planLockedStages.has(stage); i++) {
      await page.waitForTimeout(5_000);
      const agentRecord = await getAgent(agentId, accessToken);
      if (!agentRecord) continue;
      const next = (agentRecord.forge_stage as string | undefined) ?? "think";
      if (next !== stage) {
        console.log(`  stage ${stage} → ${next} (${(i + 1) * 5}s)`);
        stage = next;
      }
    }

    if (!planLockedStages.has(stage)) {
      // Fall back: read architecture.json directly — if the architect wrote
      // a plan but forge_stage didn't transition, that's a UI driver bug,
      // not a multi-agent bug. The fleet shape can still be validated.
      console.log(`  ⚠ stage stuck at ${stage}; checking sandbox for architecture.json anyway`);
    } else {
      console.log(`  ✓ stage=${stage} sandbox=${sandboxId}`);
    }

    // ── Read architecture.json from sandbox; assert fleet shape ────────
    console.log("[4/6] Reading architecture.json from sandbox…");
    const containerName = `openclaw-${sandboxId}`;
    let archRaw = "";
    for (const ws of ["workspace", "workspace-copilot"]) {
      archRaw = dockerExec(
        containerName,
        `cat $HOME/.openclaw/${ws}/.openclaw/plan/architecture.json 2>/dev/null || true`,
      ).trim();
      if (archRaw) {
        console.log(`  found architecture.json in ${ws}`);
        break;
      }
    }
    expect(archRaw, `architecture.json missing in ${containerName}`).toBeTruthy();

    let architecture: { subAgents?: SubAgent[]; skills?: Array<{ id: string }> };
    try {
      architecture = JSON.parse(archRaw);
    } catch (err) {
      throw new Error(`architecture.json is not valid JSON: ${(err as Error).message}`);
    }

    const subAgents = architecture.subAgents ?? [];
    console.log(`  subAgents.length=${subAgents.length}`);
    for (const sa of subAgents) {
      console.log(`    - ${sa.id} (${sa.type}) skills=${(sa.skills ?? []).join(",")}`);
    }

    expect(
      subAgents.length,
      "architect did not emit any subAgents — fleet path NOT triggered",
    ).toBeGreaterThanOrEqual(2);
    expect(
      subAgents.some((sa) => sa.type === "orchestrator"),
      "no orchestrator-typed sub-agent emitted",
    ).toBeTruthy();
    expect(
      subAgents.some((sa) => sa.type === "worker" || sa.type === "specialist"),
      "no worker/specialist-typed sub-agent emitted",
    ).toBeTruthy();
    console.log("  ✓ fleet shape OK (≥2 subAgents, includes orchestrator)");

    // ── Wait for per-agent build artefacts (Path B Slice 3) ────────────
    // Forge runs build automatically. Per-agent identity files are written
    // under workspace/agents/<id>/SOUL.md (see agentBuild.ts:558+).
    console.log("[5/6] Waiting for per-agent build artefacts…");
    const expectedAgentIds = new Set<string>(["main", ...subAgents.map((sa) => sa.id)]);
    const foundIds = new Set<string>();
    let buildPolls = 0;
    const maxBuildPolls = 120; // 10 min @ 5s

    while (buildPolls < maxBuildPolls && foundIds.size < 2) {
      await page.waitForTimeout(5_000);
      buildPolls++;
      const lsOut = dockerExec(
        containerName,
        `for ws in workspace workspace-copilot; do find "$HOME/.openclaw/$ws/agents" -mindepth 2 -maxdepth 2 -name SOUL.md 2>/dev/null; done`,
      ).trim();
      if (!lsOut) continue;
      foundIds.clear();
      for (const line of lsOut.split("\n")) {
        const m = line.match(/\/agents\/([^/]+)\/SOUL\.md$/);
        if (m) foundIds.add(m[1]);
      }
      if (foundIds.size > 0 && buildPolls % 6 === 0) {
        console.log(`  found ${foundIds.size} agent dirs: ${[...foundIds].join(",")}`);
      }
    }

    console.log(`  expectedAgentIds=${[...expectedAgentIds].join(",")}`);
    console.log(`  foundIds=${[...foundIds].join(",")}`);
    expect(
      foundIds.size,
      "build did NOT produce per-agent SOUL.md files — fleet decomposition not happening",
    ).toBeGreaterThanOrEqual(2);

    // ── Final ──────────────────────────────────────────────────────────
    console.log("[6/6] Final assertions…");
    await expect(page).toHaveURL(/\/agents\/create\?agentId=/);
    await expect(page.getByText("Something went wrong")).not.toBeVisible();

    console.log("");
    console.log("══════════════════════════════════════════════════════");
    console.log("  ✅ FLEET E2E PASSED");
    console.log(`     subAgents=${subAgents.length}, perAgentDirs=${foundIds.size}`);
    console.log("══════════════════════════════════════════════════════");
  });
});
