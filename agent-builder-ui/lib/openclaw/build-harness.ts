/**
 * build-harness.ts — Post-build verification harness (v2).
 *
 * Generates a verification-plan.json from the architecture plan, then runs
 * the "verify" specialist inside the forge container. The architect executes
 * each check with full tool access (bash + file write), fixes failures in-place,
 * and writes a structured verification-report.json.
 *
 * This module is a thin orchestrator — the actual work happens inside the container.
 */

import type { ArchitecturePlan, HarnessReport, HarnessPhase, PhaseResult } from "./types";
import { readWorkspaceFile } from "./workspace-writer";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HarnessCallbacks {
  onStatus: (message: string) => void;
  onPhaseStart?: (phase: HarnessPhase) => void;
  onPhaseComplete?: (result: PhaseResult) => void;
  onFixAttempt?: (phase: HarnessPhase, round: number, error: string) => void;
}

export interface HarnessOptions {
  totalTimeoutMs?: number;
}

interface VerificationCheck {
  id: string;
  command: string;
  successCondition: string;
  maxAttempts: number;
  setup?: string;
}

interface VerificationPlan {
  generatedAt: string;
  agentName: string;
  checks: VerificationCheck[];
}

interface ReportCheck {
  id: string;
  status: "pass" | "fail";
  attempts: number;
  fixApplied?: string;
  fixAttempted?: string;
  lastError?: string;
}

interface VerificationReport {
  timestamp: string;
  checks: ReportCheck[];
  summary: { total: number; pass: number; fail: number };
}

const WS = "$HOME/.openclaw/workspace";

// ─── Plan Generator ─────────────────────────────────────────────────────────

/**
 * Generate verification-plan.json from the architecture plan.
 * Deterministic — no LLM needed.
 */
export function generateVerificationPlan(plan: ArchitecturePlan, agentName: string): VerificationPlan {
  const checks: VerificationCheck[] = [];

  // 1. Dependencies — always run
  checks.push({
    id: "deps",
    command: `cd ${WS} && npm install 2>&1`,
    successCondition: "exitCode === 0",
    maxAttempts: 3,
  });

  // 2. TypeScript compilation — always run
  checks.push({
    id: "compile",
    command: `cd ${WS} && npx tsc --noEmit 2>&1`,
    successCondition: "exitCode === 0",
    maxAttempts: 5,
  });

  // 3. Dashboard build — if plan has dashboard pages
  if (plan.dashboardPages?.length) {
    checks.push({
      id: "dashboard_build",
      command: `cd ${WS}/dashboard && npx vite build --outDir dist 2>&1`,
      successCondition: "exitCode === 0 and dashboard/dist/index.html exists",
      maxAttempts: 3,
    });
  }

  // 4. Database migration — if plan has data schema
  if (plan.dataSchema?.tables?.length) {
    const tableNames = plan.dataSchema.tables.map((t) => t.name).join(", ");
    checks.push({
      id: "database",
      command: `cd ${WS} && npm run db:migrate 2>&1`,
      successCondition: `exitCode === 0 and tables exist: ${tableNames}`,
      maxAttempts: 3,
    });
  }

  // 5. Backend service — if plan has API endpoints
  if (plan.apiEndpoints?.length) {
    checks.push({
      id: "service_backend",
      command: `sleep 3 && curl -sf http://localhost:3100/health 2>&1`,
      successCondition: "HTTP 200 response",
      maxAttempts: 3,
      setup: [
        `cd ${WS}`,
        `if [ -f ${WS}/.openclaw/.env ]; then set -a; . ${WS}/.openclaw/.env 2>/dev/null; set +a; fi`,
        `kill $(cat /tmp/agent-backend.pid 2>/dev/null) 2>/dev/null; fuser -k 3100/tcp 2>/dev/null; sleep 1`,
        `PORT=3100 nohup npx tsx backend/index.ts > /tmp/agent-backend.log 2>&1 & echo $! > /tmp/agent-backend.pid`,
      ].join(" && "),
    });
  }

  // 6. Dashboard service — if plan has dashboard pages
  if (plan.dashboardPages?.length) {
    checks.push({
      id: "service_dashboard",
      command: `curl -sf http://localhost:3200/ 2>&1`,
      successCondition: "HTTP 200 response",
      maxAttempts: 2,
      setup: [
        `kill $(cat /tmp/agent-dashboard.pid 2>/dev/null) 2>/dev/null; fuser -k 3200/tcp 2>/dev/null; sleep 1`,
        `cd ${WS} && nohup npx serve dashboard/dist -l 3200 -s --no-clipboard > /tmp/agent-dashboard.log 2>&1 & echo $! > /tmp/agent-dashboard.pid`,
        `sleep 2`,
      ].join(" && "),
    });
  }

  // 7. API endpoint checks — one per planned GET endpoint
  const getEndpoints = plan.apiEndpoints?.filter((e) => e.method === "GET") ?? [];
  for (const ep of getEndpoints) {
    // Replace path params with test values
    const testPath = ep.path.split("?")[0].replace(/:[a-zA-Z]+/g, "test");
    checks.push({
      id: `endpoint_${ep.method}_${ep.path}`,
      command: `curl -sf --max-time 5 http://localhost:3100${testPath} 2>&1`,
      successCondition: "valid JSON response",
      maxAttempts: 3,
    });
  }

  // 8. Dashboard page route checks — verify each page path is served and
  // the page component file handles loading/error states correctly.
  // This catches broken navigation links and components that crash on render.
  if (plan.dashboardPages?.length) {
    // Collect unique data sources each page uses
    const pageDataSources = new Map<string, string[]>();
    for (const page of plan.dashboardPages) {
      const sources = (page.components ?? [])
        .map((c) => (c as { dataSource?: string }).dataSource)
        .filter((s): s is string => Boolean(s));
      pageDataSources.set(page.path, [...new Set(sources)]);
    }

    checks.push({
      id: "dashboard_routes",
      command: [
        `echo "Checking dashboard routes..."`,
        // Verify each page route returns HTML (SPA mode)
        ...(plan.dashboardPages ?? []).map((page) =>
          `curl -sf --max-time 5 http://localhost:3200${page.path} > /dev/null && echo "OK: ${page.path}" || echo "FAIL: ${page.path}"`,
        ),
        // Verify each page's API data sources are reachable from the dashboard context
        ...Array.from(pageDataSources.entries()).flatMap(([pagePath, sources]) =>
          sources.map((src) => {
            const testSrc = src.split("?")[0].replace(/:[a-zA-Z]+/g, "test");
            return `curl -sf --max-time 5 http://localhost:3100${testSrc} > /dev/null && echo "API OK: ${testSrc} (for ${pagePath})" || echo "API FAIL: ${testSrc} (for ${pagePath})"`;
          }),
        ),
      ].join(" && "),
      successCondition: "all routes return HTML and all data sources return JSON",
      maxAttempts: 3,
    });

    // Verify page component files exist and handle errors properly
    checks.push({
      id: "dashboard_page_quality",
      command: [
        `cd ${WS}/dashboard`,
        `echo "Checking page components..."`,
        // Check each page file exists
        ...(plan.dashboardPages ?? []).map((page) => {
          const fileName = page.path.split("/").pop() ?? "index";
          return `test -f pages/${fileName}.tsx && echo "EXISTS: pages/${fileName}.tsx" || echo "MISSING: pages/${fileName}.tsx"`;
        }),
        // Check that page components handle loading/error states (must have try/catch or error boundary)
        `echo "Checking error handling..."`,
        `grep -rL "catch\\|error\\|Error\\|loading\\|Loading" pages/*.tsx 2>/dev/null | while read f; do echo "NO_ERROR_HANDLING: $f"; done`,
        // Check API base URL is configured (not hardcoded to wrong host)
        `echo "Checking API configuration..."`,
        `grep -r "localhost:3100\\|/api/" pages/*.tsx hooks/*.ts 2>/dev/null | head -5`,
      ].join(" && "),
      successCondition: "all page files exist and have error handling, API URL is correct",
      maxAttempts: 2,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    agentName,
    checks,
  };
}

// ─── Report Reader ──────────────────────────────────────────────────────────

/**
 * Read the verification report from the workspace and convert to HarnessReport.
 */
export function reportToHarnessReport(report: VerificationReport, plan: VerificationPlan): HarnessReport {
  const phaseMap = new Map<HarnessPhase, PhaseResult>();

  for (const check of report.checks) {
    const phase = checkIdToPhase(check.id);
    const existing = phaseMap.get(phase);

    if (!existing) {
      phaseMap.set(phase, {
        phase,
        status: check.status === "pass" ? "pass" : "fail",
        rounds: check.attempts,
        fixAttempts: check.attempts > 1 ? check.attempts - 1 : 0,
        fixSuccesses: check.status === "pass" && check.attempts > 1 ? 1 : 0,
        detail: check.status === "pass"
          ? (check.fixApplied ? `Fixed: ${check.fixApplied}` : "Passed")
          : `Failed: ${check.lastError?.slice(0, 200) ?? "unknown"}`,
        errors: check.status === "fail" ? [check.lastError ?? "unknown"] : [],
        durationMs: 0,
      });
    } else {
      // Aggregate multiple checks into one phase (e.g., multiple endpoints → "endpoints")
      if (check.status === "fail") existing.status = "fail";
      existing.rounds = Math.max(existing.rounds, check.attempts);
      if (check.attempts > 1) existing.fixAttempts += check.attempts - 1;
      if (check.status === "pass" && check.fixApplied) existing.fixSuccesses++;
      if (check.status === "fail" && check.lastError) {
        existing.errors.push(check.lastError.slice(0, 200));
        existing.detail = `${existing.errors.length} sub-check(s) failing`;
      }
    }
  }

  // Add skipped phases
  const skippedPhases: HarnessPhase[] = [];
  const allPhases: HarnessPhase[] = ["deps", "compile", "dashboard_build", "database", "services", "endpoints"];
  for (const p of allPhases) {
    if (!phaseMap.has(p)) {
      const planHasIt = plan.checks.some((c) => checkIdToPhase(c.id) === p);
      if (!planHasIt) skippedPhases.push(p);
    }
  }

  const phases = Array.from(phaseMap.values());
  const totalFixAttempts = phases.reduce((s, p) => s + p.fixAttempts, 0);
  const totalFixSuccesses = phases.reduce((s, p) => s + p.fixSuccesses, 0);

  return {
    timestamp: report.timestamp,
    phases,
    overallStatus: phases.some((p) => p.status === "fail") ? "fail" : "pass",
    totalFixAttempts,
    totalFixSuccesses,
    totalDurationMs: 0,
    skippedPhases,
  };
}

function checkIdToPhase(id: string): HarnessPhase {
  if (id === "deps") return "deps";
  if (id === "compile") return "compile";
  if (id === "dashboard_build" || id === "dashboard_routes" || id === "dashboard_page_quality") return "dashboard_build";
  if (id === "database") return "database";
  if (id.startsWith("service_")) return "services";
  if (id.startsWith("endpoint_")) return "endpoints";
  return "deps"; // fallback
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Run post-build verification.
 *
 * 1. Generate verification-plan.json from the architecture plan
 * 2. Write it to the workspace
 * 3. The caller (build-orchestrator) runs the "verify" specialist
 * 4. After the specialist finishes, call readVerificationReport() to get results
 *
 * This function only handles step 1-2. Steps 3-4 are in the orchestrator.
 */
export async function writeVerificationPlan(
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
): Promise<VerificationPlan> {
  const verificationPlan = generateVerificationPlan(plan, agentName);
  const content = JSON.stringify(verificationPlan, null, 2);

  // Write directly to the main workspace (not workspace-copilot) via the exec
  // endpoint, so the architect can read it immediately inside the container.
  // The standard writeWorkspaceFile goes to workspace-copilot/ which the
  // architect doesn't see until after the merge step.
  await fetchBackendWithAuth(`${API_BASE}/api/sandboxes/${sandboxId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: `mkdir -p $HOME/.openclaw/workspace/.openclaw/build && cat > $HOME/.openclaw/workspace/.openclaw/build/verification-plan.json << 'ENDPLAN'\n${content}\nENDPLAN`,
      timeoutMs: 10_000,
    }),
  });

  return verificationPlan;
}

/**
 * Read the verification report written by the verify specialist.
 */
export async function readVerificationReport(
  sandboxId: string,
  plan: VerificationPlan,
): Promise<HarnessReport | null> {
  const content = await readWorkspaceFile(sandboxId, ".openclaw/build/verification-report.json");
  if (!content) return null;

  try {
    const report = JSON.parse(content) as VerificationReport;
    return reportToHarnessReport(report, plan);
  } catch {
    return null;
  }
}
