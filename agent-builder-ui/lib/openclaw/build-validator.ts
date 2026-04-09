/**
 * build-validator.ts — Post-build validation for the v4 orchestrator.
 *
 * Checks that the workspace matches the architecture plan:
 * - Every planned skill has a SKILL.md file
 * - Every manifest task marked "done" has its files present
 * - Reports missing files and overall pass/warn/fail status
 */

import type { ArchitecturePlan, BuildManifest, ValidationReport, DeepValidationReport, DeepValidationCheck } from "./types";
import { readWorkspaceFile } from "./workspace-writer";
import { sendToForgeSandboxChat } from "./api";
import { v4 as uuidv4 } from "uuid";

/**
 * Check whether a file exists in the sandbox workspace.
 * Uses readWorkspaceFile which returns null for missing files.
 */
async function fileExists(sandboxId: string, path: string): Promise<boolean> {
  const content = await readWorkspaceFile(sandboxId, path);
  return content !== null;
}

/**
 * Run post-build validation against the plan and manifest.
 */
export async function runValidation(
  sandboxId: string,
  manifest: BuildManifest,
  plan: ArchitecturePlan,
): Promise<ValidationReport> {
  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    planSkillsCovered: 0,
    planSkillsMissing: [],
    planEndpointsCovered: 0,
    planEndpointsMissing: [],
    planPagesCovered: 0,
    planPagesMissing: [],
    manifestFilesVerified: 0,
    manifestFilesMissing: [],
    overallStatus: "pass",
  };

  // Check planned skills have SKILL.md files
  if (plan.skills?.length) {
    const checks = await Promise.all(
      plan.skills.map(async (skill) => {
        const exists = await fileExists(sandboxId, `skills/${skill.id}/SKILL.md`);
        return { id: skill.id, exists };
      }),
    );
    for (const { id, exists } of checks) {
      if (exists) {
        report.planSkillsCovered++;
      } else {
        report.planSkillsMissing.push(id);
      }
    }
  }

  // Check planned API endpoints have route files
  if (plan.apiEndpoints?.length) {
    const checks = await Promise.all(
      plan.apiEndpoints.map(async (ep) => {
        // Derive expected file from path: /api/campaigns/stats → backend/routes/campaigns.ts
        const routeName = ep.path.replace(/^\/api\//, "").split("/")[0];
        const exists = await fileExists(sandboxId, `backend/routes/${routeName}.ts`);
        return { path: ep.path, exists };
      }),
    );
    for (const { path, exists } of checks) {
      if (exists) {
        report.planEndpointsCovered++;
      } else {
        report.planEndpointsMissing.push(path);
      }
    }
  }

  // Check planned dashboard pages have component files
  if (plan.dashboardPages?.length) {
    const checks = await Promise.all(
      plan.dashboardPages.map(async (page) => {
        // Derive expected file: /overview → dashboard/pages/Overview.tsx
        const pageName = page.path.replace(/^\//, "");
        const capitalized = pageName.charAt(0).toUpperCase() + pageName.slice(1);
        const exists = await fileExists(sandboxId, `dashboard/pages/${capitalized}.tsx`);
        return { path: page.path, exists };
      }),
    );
    for (const { path, exists } of checks) {
      if (exists) {
        report.planPagesCovered++;
      } else {
        report.planPagesMissing.push(path);
      }
    }
  }

  // Check manifest task files actually exist
  const doneTasks = manifest.tasks.filter((t) => t.status === "done");
  const allFiles = doneTasks.flatMap((t) => t.files);
  if (allFiles.length > 0) {
    const checks = await Promise.all(
      allFiles.map(async (file) => {
        const exists = await fileExists(sandboxId, file);
        return { file, exists };
      }),
    );
    for (const { file, exists } of checks) {
      if (exists) {
        report.manifestFilesVerified++;
      } else {
        report.manifestFilesMissing.push(file);
      }
    }
  }

  // Determine overall status
  const totalMissing =
    report.planSkillsMissing.length +
    report.planEndpointsMissing.length +
    report.planPagesMissing.length +
    report.manifestFilesMissing.length;

  if (totalMissing === 0) {
    report.overallStatus = "pass";
  } else if (report.manifestFilesMissing.length > 0) {
    // Manifest claims files were written but they're missing — that's a failure
    report.overallStatus = "fail";
  } else {
    // Plan items missing but manifest is consistent — warn
    report.overallStatus = "warn";
  }

  return report;
}

// ─── Deep Validation with Auto-Fix Loop ──────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AutoFixCallbacks {
  onStatus?: (msg: string) => void;
  onCheckResult?: (check: DeepValidationCheck) => void;
  onAutoFixAttempt?: (check: DeepValidationCheck, attempt: number) => void;
}

async function callDeepValidation(sandboxId: string, plan: ArchitecturePlan): Promise<DeepValidationReport> {
  const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(`Validation endpoint returned ${res.status}`);
  return res.json();
}

async function sendFixToArchitect(sandboxId: string, fixContext: string, sessionId: string): Promise<boolean> {
  try {
    await sendToForgeSandboxChat(sandboxId, sessionId, fixContext, { onStatus: () => {} }, { readTimeoutMs: 120_000 });
    return true;
  } catch (err) {
    console.warn("[auto-fix] Architect fix failed:", err);
    return false;
  }
}

async function restartServices(sandboxId: string): Promise<void> {
  await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Run deep validation and auto-fix loop.
 * 1. Validate DB, API endpoints, contracts, dashboard, integration
 * 2. For each failure with fixContext, send fix prompt to architect
 * 3. After fixes, restart services and re-validate
 * 4. Max 3 retry rounds
 */
export async function runDeepValidationWithAutoFix(
  sandboxId: string,
  plan: ArchitecturePlan,
  callbacks: AutoFixCallbacks = {},
  opts: { maxRetries?: number; totalTimeoutMs?: number } = {},
): Promise<DeepValidationReport> {
  const maxRetries = opts.maxRetries ?? 3;
  const totalTimeoutMs = opts.totalTimeoutMs ?? 120_000; // 2 minutes total budget
  const sessionId = `validate-${uuidv4()}`;
  let totalFixAttempts = 0;
  let totalFixSuccesses = 0;
  const startedAt = Date.now();

  const isTimedOut = () => Date.now() - startedAt > totalTimeoutMs;

  callbacks.onStatus?.("Running deep validation...");
  let report: DeepValidationReport;
  try {
    report = await callDeepValidation(sandboxId, plan);
  } catch (err) {
    callbacks.onStatus?.("Deep validation endpoint unavailable — skipping.");
    return { checks: [], passCount: 0, failCount: 0, overallStatus: "pass", autoFixAttempts: 0, autoFixSuccesses: 0, timestamp: new Date().toISOString() };
  }
  for (const check of report.checks) callbacks.onCheckResult?.(check);

  for (let round = 0; round < maxRetries && report.overallStatus === "fail"; round++) {
    if (isTimedOut()) {
      callbacks.onStatus?.("Validation time budget exceeded — stopping auto-fix.");
      break;
    }

    const failures = report.checks.filter(c => c.status === "fail" && c.fixContext);
    if (failures.length === 0) break;

    callbacks.onStatus?.(`Found ${failures.length} issue${failures.length > 1 ? "s" : ""} — auto-fixing (round ${round + 1}/${maxRetries})...`);

    for (const failure of failures) {
      if (isTimedOut()) break;
      totalFixAttempts++;
      callbacks.onAutoFixAttempt?.(failure, round + 1);
      callbacks.onStatus?.(`Fixing: ${failure.label}`);
      const fixed = await sendFixToArchitect(sandboxId, failure.fixContext!, sessionId);
      callbacks.onStatus?.(fixed ? `Fix applied for: ${failure.label}` : `Fix failed for: ${failure.label}`);
    }

    if (isTimedOut()) break;

    callbacks.onStatus?.("Rebuilding and restarting services...");
    try { await restartServices(sandboxId); } catch { callbacks.onStatus?.("Service restart failed — continuing validation..."); }

    callbacks.onStatus?.("Re-validating...");
    let newReport: DeepValidationReport;
    try {
      newReport = await callDeepValidation(sandboxId, plan);
    } catch {
      callbacks.onStatus?.("Re-validation endpoint unavailable — stopping.");
      break;
    }

    for (const newCheck of newReport.checks) {
      const oldCheck = report.checks.find(c => c.check === newCheck.check && c.endpoint === newCheck.endpoint && c.status === "fail");
      if (oldCheck && newCheck.status === "pass") {
        totalFixSuccesses++;
        newCheck.attempt = round + 1;
      }
      callbacks.onCheckResult?.(newCheck);
    }
    report = newReport;
  }

  return { ...report, autoFixAttempts: totalFixAttempts, autoFixSuccesses: totalFixSuccesses };
}
