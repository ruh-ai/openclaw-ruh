/**
 * build-validator.ts — Post-build validation for the v4 orchestrator.
 *
 * Checks that the workspace matches the architecture plan:
 * - Every planned skill has a SKILL.md file
 * - Every manifest task marked "done" has its files present
 * - Reports missing files and overall pass/warn/fail status
 */

import type { ArchitecturePlan, BuildManifest, ValidationReport } from "./types";
import { readWorkspaceFile } from "./workspace-writer";

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
