export type BuildReadiness = "blocked" | "test-ready" | "ship-ready";

export interface BuildReportCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  detail?: string;
}

export interface BuildReport {
  generatedAt: string;
  readiness: BuildReadiness;
  blockers: string[];
  warnings: string[];
  checks: BuildReportCheck[];
}

export interface BuildReportInput {
  manifestTasks: Array<{ specialist: string; status: string; error?: string }>;
  setup: Array<{ name: string; ok: boolean; optional?: boolean; output?: string; skipped?: boolean }>;
  services: Array<{ name: string; healthy: boolean; optional?: boolean; port?: number }>;
  verification: { status: string; checks: unknown[] };
}

function checkStatus(ok: boolean, optional?: boolean): BuildReportCheck["status"] {
  if (ok) return "pass";
  return optional ? "warning" : "fail";
}

export function summarizeBuildReport(input: BuildReportInput): BuildReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: BuildReportCheck[] = [];

  for (const task of input.manifestTasks) {
    const ok = task.status === "done";
    if (!ok && task.status === "failed") {
      blockers.push(`Build task failed: ${task.specialist}`);
    }
    checks.push({
      name: `build:${task.specialist}`,
      status: ok ? "pass" : "fail",
      detail: task.error,
    });
  }

  for (const step of input.setup) {
    if (step.skipped) {
      checks.push({ name: `setup:${step.name}`, status: "warning", detail: "skipped" });
      continue;
    }
    if (!step.ok && step.optional) warnings.push(`Optional setup failed: ${step.name}`);
    if (!step.ok && !step.optional) blockers.push(`Required setup failed: ${step.name}`);
    checks.push({
      name: `setup:${step.name}`,
      status: checkStatus(step.ok, step.optional),
      detail: step.output,
    });
  }

  for (const service of input.services) {
    if (!service.healthy && service.optional) warnings.push(`Optional service unhealthy: ${service.name}`);
    if (!service.healthy && !service.optional) blockers.push(`Required service unhealthy: ${service.name}`);
    checks.push({
      name: `service:${service.name}`,
      status: checkStatus(service.healthy, service.optional),
      detail: service.port ? `port ${service.port}` : undefined,
    });
  }

  const readiness: BuildReadiness = blockers.length > 0
    ? "blocked"
    : input.verification.status === "done"
      ? "ship-ready"
      : "test-ready";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    blockers,
    warnings,
    checks,
  };
}
