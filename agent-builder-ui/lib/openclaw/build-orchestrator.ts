/**
 * build-orchestrator.ts — V4 build pipeline orchestrator.
 *
 * The sole build path for agent creation. Reads the architecture plan,
 * determines which specialists to run, executes them in dependency order,
 * writes build-manifest.json on every status change (live tracking),
 * and runs post-build validation.
 *
 * Dependency graph:
 *   scaffold → identity → database → backend → dashboard
 *                       → skills (parallel with backend/dashboard)
 *
 * Two modes:
 *   - Workspace-first: reads plan from .openclaw/plan/architecture.json
 *   - In-memory fallback: receives plan from caller (backward compat)
 */

import { v4 as uuidv4 } from "uuid";
import type { ArchitecturePlan, BuildManifest, BuildManifestTask, DiscoveryDocuments, ValidationReport } from "./types";
import { sendToArchitectStreaming } from "./api";
import { getRequiredSpecialists, getSpecialistPrompt, type SpecialistType } from "@/app/(platform)/agents/create/_config/specialist-prompts";
import { readWorkspaceFile, writeWorkspaceFile, writeWorkspaceFiles } from "./workspace-writer";

// ─── Callbacks ──────────────────────────────────────────────────────────────

export interface BuildOrchestratorCallbacks {
  onTaskStart: (task: BuildManifestTask) => void;
  onTaskComplete: (task: BuildManifestTask) => void;
  onTaskFailed: (task: BuildManifestTask, error: string) => void;
  onFileWritten: (path: string) => void;
  onProgress: (completed: number, total: number) => void;
  onStatus: (message: string) => void;
  onValidation?: (report: ValidationReport) => void;
}

export interface BuildPipelineOptions {
  plan?: ArchitecturePlan;
  agentName?: string;
  discoveryDocs?: DiscoveryDocuments | null;
}

// ─── Task creation ──────────────────────────────────────────────────────────

function createTask(specialist: SpecialistType): BuildManifestTask {
  return {
    id: `${specialist}-${uuidv4().slice(0, 8)}`,
    specialist,
    status: "pending",
    files: [],
  };
}

// ─── Manifest persistence ───────────────────────────────────────────────────

async function persistManifest(sandboxId: string, manifest: BuildManifest): Promise<void> {
  try {
    await writeWorkspaceFile(
      sandboxId,
      ".openclaw/plan/build-manifest.json",
      JSON.stringify(manifest, null, 2),
    );
  } catch (err) {
    console.warn("[build-orchestrator] Failed to write manifest:", err);
  }
}

// ─── Workspace plan reading ─────────────────────────────────────────────────

async function readPlanFromWorkspace(sandboxId: string): Promise<ArchitecturePlan | null> {
  const content = await readWorkspaceFile(sandboxId, ".openclaw/plan/architecture.json");
  if (!content) return null;
  try {
    const { normalizePlan } = await import("./plan-formatter");
    return normalizePlan(JSON.parse(content));
  } catch {
    console.warn("[build-orchestrator] Failed to parse architecture.json from workspace");
    return null;
  }
}

// ─── Specialist execution ───────────────────────────────────────────────────

async function runSpecialist(
  task: BuildManifestTask,
  plan: ArchitecturePlan,
  agentName: string,
  sandboxId: string,
  manifest: BuildManifest,
  callbacks: BuildOrchestratorCallbacks,
): Promise<void> {
  task.status = "running";
  task.startedAt = new Date().toISOString();
  callbacks.onTaskStart(task);
  await persistManifest(sandboxId, manifest);

  const prompt = getSpecialistPrompt(task.specialist as SpecialistType, plan, agentName);

  try {
    const response = await sendToArchitectStreaming(
      uuidv4(),
      prompt,
      {
        onStatus: (_phase, message) => {
          callbacks.onStatus(`[${task.specialist}] ${message}`);
        },
        onDelta: () => {
          // Real-time text from architect — no-op, we wait for completion
        },
        onCustomEvent: (name, data) => {
          if (name === "file_written" && data && typeof data === "object") {
            const path = (data as { path?: string }).path;
            if (path) {
              task.files.push(path);
              callbacks.onFileWritten(path);
            }
          }
        },
      },
      {
        forgeSandboxId: sandboxId,
        mode: "copilot",
      },
    );

    // Try to extract file list from response
    const content = response.content ?? "";
    const doneMatch = content.match(/\{[\s\S]*"specialist_done"[\s\S]*\}/);
    if (doneMatch) {
      try {
        const done = JSON.parse(doneMatch[0]);
        if (Array.isArray(done.files)) {
          for (const f of done.files) {
            if (typeof f === "string" && !task.files.includes(f)) {
              task.files.push(f);
            }
          }
        }
      } catch {
        // Ignore parse failures
      }
    }

    task.status = "done";
    task.completedAt = new Date().toISOString();
    callbacks.onTaskComplete(task);
    await persistManifest(sandboxId, manifest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    task.status = "failed";
    task.error = message;
    task.completedAt = new Date().toISOString();
    callbacks.onTaskFailed(task, message);
    await persistManifest(sandboxId, manifest);
    throw err;
  }
}

// ─── Scaffold (deterministic, no LLM) ──────────────────────────────────────

async function runScaffold(
  task: BuildManifestTask,
  plan: ArchitecturePlan,
  agentName: string,
  sandboxId: string,
  manifest: BuildManifest,
  callbacks: BuildOrchestratorCallbacks,
): Promise<void> {
  task.status = "running";
  task.startedAt = new Date().toISOString();
  callbacks.onTaskStart(task);
  await persistManifest(sandboxId, manifest);

  try {
    const { generateScaffoldFiles } = await import("./scaffold-templates");
    const files = generateScaffoldFiles(plan, agentName);
    const result = await writeWorkspaceFiles(sandboxId, files);
    task.files = files.map((f) => f.path);
    for (const f of files) {
      callbacks.onFileWritten(f.path);
    }

    if (!result.ok && result.failed > 0) {
      throw new Error(`Scaffold wrote ${result.succeeded}/${files.length} files`);
    }

    task.status = "done";
    task.completedAt = new Date().toISOString();
    callbacks.onTaskComplete(task);
    await persistManifest(sandboxId, manifest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    task.status = "failed";
    task.error = message;
    task.completedAt = new Date().toISOString();
    callbacks.onTaskFailed(task, message);
    await persistManifest(sandboxId, manifest);
    throw err;
  }
}

// ─── Main pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full build pipeline.
 *
 * Execution order:
 * 1. Scaffold (deterministic — package.json, Dockerfile, etc.)
 * 2. Identity (SOUL.md, AGENTS.md) — always
 * 3. Database (migrations, types) — if plan has dataSchema
 * 4. Backend + Skills (parallel) — backend if plan has apiEndpoints, skills always
 * 5. Dashboard — if plan has dashboardPages, after backend
 * 6. Validation — check workspace matches plan
 * 7. Write final build-manifest.json
 */
export async function runBuildPipeline(
  sandboxId: string,
  callbacks: BuildOrchestratorCallbacks,
  options?: BuildPipelineOptions,
): Promise<BuildManifest> {
  // Resolve plan: workspace-first, fallback to in-memory
  let plan = options?.plan ?? null;
  if (!plan) {
    callbacks.onStatus("Reading plan from workspace...");
    plan = await readPlanFromWorkspace(sandboxId);
  }
  if (!plan) {
    throw new Error("No architecture plan found — provide via options or persist to workspace first");
  }
  // Normalize: fill missing fields to prevent crashes from architect omissions
  const { normalizePlan } = await import("./plan-formatter");
  plan = normalizePlan(plan as unknown as Record<string, unknown>);

  const agentName = options?.agentName ?? "agent";

  // Determine required specialists and create tasks
  const specialists = getRequiredSpecialists(plan);
  const scaffoldTask = createTask("scaffold" as SpecialistType);
  const tasks = [scaffoldTask, ...specialists.map(createTask)];

  const manifest: BuildManifest = {
    version: 3,
    agentName,
    createdAt: new Date().toISOString(),
    plan: ".openclaw/plan/architecture.json",
    tasks,
  };

  // Write initial manifest
  await persistManifest(sandboxId, manifest);

  const total = tasks.length;
  let completed = 0;

  const markDone = () => {
    completed++;
    callbacks.onProgress(completed, total);
  };

  const findTask = (type: string) => tasks.find((t) => t.specialist === type);

  try {
    // Phase A: Scaffold (deterministic, fast)
    callbacks.onStatus("Generating scaffold files...");
    await runScaffold(scaffoldTask, plan, agentName, sandboxId, manifest, callbacks);
    markDone();

    // Phase B: Identity (always first LLM task — writes SOUL.md)
    const identityTask = findTask("identity");
    if (identityTask) {
      callbacks.onStatus("Building agent identity...");
      await runSpecialist(identityTask, plan, agentName, sandboxId, manifest, callbacks);
      markDone();
    }

    // Phase C: Database (must complete before backend)
    const dbTask = findTask("database");
    if (dbTask) {
      callbacks.onStatus("Creating database schema...");
      await runSpecialist(dbTask, plan, agentName, sandboxId, manifest, callbacks);
      markDone();
    }

    // Phase D: Backend + Skills in parallel
    const backendTask = findTask("backend");
    const skillsTask = findTask("skills");
    const parallelTasks: Promise<void>[] = [];

    if (backendTask) {
      callbacks.onStatus("Building backend API...");
      parallelTasks.push(
        runSpecialist(backendTask, plan, agentName, sandboxId, manifest, callbacks).then(markDone),
      );
    }
    if (skillsTask) {
      callbacks.onStatus("Building skill handlers...");
      parallelTasks.push(
        runSpecialist(skillsTask, plan, agentName, sandboxId, manifest, callbacks).then(markDone),
      );
    }
    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks);
    }

    // Phase E: Dashboard (depends on backend routes)
    const dashboardTask = findTask("dashboard");
    if (dashboardTask) {
      callbacks.onStatus("Building dashboard...");
      await runSpecialist(dashboardTask, plan, agentName, sandboxId, manifest, callbacks);
      markDone();
    }

    manifest.completedAt = new Date().toISOString();
  } catch {
    // Individual task errors are already recorded — continue to write manifest
    manifest.completedAt = new Date().toISOString();
  }

  // Phase F: Validation
  callbacks.onStatus("Validating build output...");
  try {
    const { runValidation } = await import("./build-validator");
    const report = await runValidation(sandboxId, manifest, plan);
    callbacks.onValidation?.(report);

    // Persist validation report
    await writeWorkspaceFile(
      sandboxId,
      ".openclaw/build/validation-report.json",
      JSON.stringify(report, null, 2),
    );
  } catch (err) {
    console.warn("[build-orchestrator] Validation failed:", err);
  }

  // Write final manifest
  callbacks.onStatus("Saving build manifest...");
  await persistManifest(sandboxId, manifest);

  // Merge workspace-copilot/ → workspace/
  callbacks.onStatus("Merging build output to workspace...");
  try {
    const { mergeWorkspaceCopilotToMain } = await import("./workspace-writer");
    const merged = await mergeWorkspaceCopilotToMain(sandboxId);
    if (!merged) {
      console.warn("[build-orchestrator] Workspace merge returned false");
    }
  } catch (err) {
    console.warn("[build-orchestrator] Workspace merge failed:", err);
  }

  // Phase G: Run agent setup (install deps, run migrations, start services)
  // Only if the build produced a setup.json (v3 agents with backend/dashboard)
  callbacks.onStatus("Starting agent services...");
  try {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const setupRes = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (setupRes.ok) {
      const setupResult = await setupRes.json();
      if (setupResult.ok) {
        callbacks.onStatus("Agent services started.");
        // Log service health
        for (const svc of setupResult.services ?? []) {
          callbacks.onStatus(`  ${svc.name}: ${svc.healthy ? "healthy" : "unhealthy"} (port ${svc.port})`);
        }
      } else {
        callbacks.onStatus("Agent setup completed with issues — some services may not be running.");
      }
    } else {
      console.warn("[build-orchestrator] Setup endpoint returned", setupRes.status);
    }
  } catch (err) {
    console.warn("[build-orchestrator] Agent setup failed:", err);
    callbacks.onStatus("Agent setup skipped — services not started.");
  }

  return manifest;
}

// ─── Retry failed tasks ─────────────────────────────────────────────────────

/**
 * Re-run only failed tasks from an existing manifest.
 */
export async function retryFailedTasks(
  sandboxId: string,
  manifest: BuildManifest,
  callbacks: BuildOrchestratorCallbacks,
  options?: { plan?: ArchitecturePlan },
): Promise<BuildManifest> {
  let plan = options?.plan ?? null;
  if (!plan) {
    plan = await readPlanFromWorkspace(sandboxId);
  }
  if (!plan) {
    throw new Error("No architecture plan found for retry");
  }

  const failedTasks = manifest.tasks.filter((t) => t.status === "failed");
  if (failedTasks.length === 0) return manifest;

  const total = failedTasks.length;
  let completed = 0;

  for (const task of failedTasks) {
    // Reset task state
    task.status = "pending";
    task.error = undefined;
    task.files = [];
    task.startedAt = undefined;
    task.completedAt = undefined;

    try {
      await runSpecialist(task, plan, manifest.agentName, sandboxId, manifest, callbacks);
      completed++;
      callbacks.onProgress(completed, total);
    } catch {
      // Error already recorded on task
    }
  }

  manifest.completedAt = new Date().toISOString();
  await persistManifest(sandboxId, manifest);

  return manifest;
}
