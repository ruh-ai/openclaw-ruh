/**
 * Integration test: Run the verification specialist against a real forge container.
 *
 * Usage: bun run lib/openclaw/build-harness.integration-test.ts
 *
 * Requires:
 * - Backend running on localhost:8000
 * - Amazon Agent forge sandbox running (6a1ced6c-e0c7-4133-9c86-8e070862e3c1)
 * - Architecture plan in the container workspace
 */

import { generateVerificationPlan, reportToHarnessReport } from "./build-harness";
import { sendToArchitectStreaming } from "./api";
import { getSpecialistPrompt } from "@/app/(platform)/agents/create/_config/specialist-prompts";
import type { ArchitecturePlan } from "./types";

const API_BASE = "http://localhost:8000";
const SANDBOX_ID = "6a1ced6c-e0c7-4133-9c86-8e070862e3c1";
const AGENT_NAME = "Amazon Agent";

/** Direct fetch helpers that bypass the browser-only fetchBackendWithAuth */
let authToken = "";

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "builder@ruh.ai", password: "SecurePass1!" }),
  });
  const data = await res.json() as { accessToken: string; user: { id: string; email: string } };
  authToken = data.accessToken;
  return authToken;
}

async function readWorkspaceFile(sandboxId: string, path: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/workspace/file?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as { content?: string };
  return typeof data === "string" ? data : (data.content ?? JSON.stringify(data));
}

async function writeWorkspaceFile(sandboxId: string, path: string, content: string): Promise<boolean> {
  // Write to main workspace (not workspace-copilot) via exec endpoint
  // so the architect can find the file immediately
  const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      command: `mkdir -p $(dirname $HOME/.openclaw/workspace/${path}) && cat > $HOME/.openclaw/workspace/${path} << 'ENDWRITE'\n${content}\nENDWRITE`,
      timeoutMs: 10_000,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json() as { ok: boolean };
  return data.ok;
}

async function main() {
  console.log("=== Build Harness v2 Integration Test ===\n");

  // Step 0: Login
  console.log("[0] Logging in...");
  await login();
  console.log(`  ✓ Authenticated (token: ${authToken.slice(0, 10)}...)\n`);

  // Step 1: Read the architecture plan from workspace
  console.log("[1] Reading architecture plan from workspace...");
  const planJson = await readWorkspaceFile(SANDBOX_ID, ".openclaw/plan/architecture.json");
  if (!planJson) {
    console.error("FAIL: No architecture plan found in workspace");
    process.exit(1);
  }
  const plan: ArchitecturePlan = JSON.parse(planJson);
  console.log(`  ✓ Plan loaded: ${plan.skills?.length ?? 0} skills, ${plan.apiEndpoints?.length ?? 0} endpoints, ${plan.dashboardPages?.length ?? 0} pages\n`);

  // Step 2: Generate and write verification plan
  console.log("[2] Generating verification plan...");
  const verificationPlan = generateVerificationPlan(plan, AGENT_NAME);
  console.log(`  ✓ ${verificationPlan.checks.length} checks generated:`);
  for (const c of verificationPlan.checks) {
    console.log(`    - ${c.id} (max ${c.maxAttempts} attempts)${c.setup ? " [has setup]" : ""}`);
  }

  // Write to workspace using direct API
  const planContent = JSON.stringify(verificationPlan, null, 2);
  const writeOk = await writeWorkspaceFile(SANDBOX_ID, ".openclaw/build/verification-plan.json", planContent);
  if (!writeOk) {
    console.error("FAIL: Could not write verification-plan.json to workspace");
    process.exit(1);
  }
  console.log(`  ✓ Written to workspace (${planContent.length} bytes)\n`);

  // Step 3: Run the verification specialist
  // Call the backend sandbox chat endpoint directly (bypassing the Next.js API route
  // which only works in-browser). The backend proxies to the forge gateway.
  console.log("[3] Running verification specialist...");
  console.log("  Sending prompt to forge sandbox via backend chat endpoint...");
  console.log("  (This may take 5-15 minutes — the architect will run checks and fix code)\n");

  const prompt = getSpecialistPrompt("verify", plan, AGENT_NAME);
  const sessionId = `verify-test-${Date.now()}`;
  const startTime = Date.now();

  try {
    const chatRes = await fetch(`${API_BASE}/api/sandboxes/${SANDBOX_ID}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: "openai-codex/gpt-5.5",
        stream: true,
      }),
    });

    if (!chatRes.ok || !chatRes.body) {
      console.error(`  ✗ Chat endpoint returned ${chatRes.status}`);
      const text = await chatRes.text();
      console.error(`  Body: ${text.slice(0, 300)}`);
    } else {
      // Stream the SSE response
      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let toolCount = 0;
      let lastLine = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          // Show tool execution events
          if (line.includes('"tool_use"') || line.includes('"bash"') || line.includes("file_written")) {
            toolCount++;
            if (toolCount % 5 === 0) {
              console.log(`  ... ${toolCount} tool executions so far (${Math.round((Date.now() - startTime) / 1000)}s)`);
            }
          }
          lastLine = line;
        }
      }

      const durationSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n  ✓ Chat stream completed in ${durationSec}s (${toolCount} tool events)`);
    }
  } catch (err) {
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n  ✗ Chat failed after ${durationSec}s:`, err instanceof Error ? err.message : err);
  }

  // Step 4: Read the verification report
  console.log("\n[4] Reading verification report...");
  const reportRaw = await readWorkspaceFile(SANDBOX_ID, ".openclaw/build/verification-report.json");

  if (!reportRaw) {
    console.error("  ✗ File does not exist — architect did NOT write verification-report.json");
    console.log("  This means the architect did not follow the verification prompt correctly.");
    process.exit(1);
  }

  let harnessReport;
  try {
    const report = JSON.parse(reportRaw);
    harnessReport = reportToHarnessReport(report, verificationPlan);
  } catch (err) {
    console.error("  ✗ Report exists but is not valid JSON:");
    console.log("  Raw content (first 500 chars):", reportRaw.slice(0, 500));
    process.exit(1);
  }

  console.log(`  ✓ Report loaded: ${harnessReport.overallStatus.toUpperCase()}`);
  console.log(`  Total: ${harnessReport.phases.length} phases, ${harnessReport.totalFixAttempts} fix attempts, ${harnessReport.totalFixSuccesses} successes`);
  console.log("\n  Phase results:");
  for (const p of harnessReport.phases) {
    const icon = p.status === "pass" ? "✅" : "❌";
    const fixes = p.fixAttempts > 0 ? ` (${p.fixSuccesses}/${p.fixAttempts} fixes)` : "";
    console.log(`    ${icon} ${p.phase}: ${p.detail}${fixes}`);
    if (p.errors.length > 0) {
      for (const e of p.errors) {
        console.log(`       └─ ${e.slice(0, 150)}`);
      }
    }
  }
  if (harnessReport.skippedPhases.length > 0) {
    console.log(`  Skipped: ${harnessReport.skippedPhases.join(", ")}`);
  }

  console.log(`\n=== RESULT: ${harnessReport.overallStatus.toUpperCase()} ===`);
  process.exit(harnessReport.overallStatus === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
