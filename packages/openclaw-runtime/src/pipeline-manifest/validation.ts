/**
 * Pipeline manifest — cross-validation rules.
 *
 * Implements: docs/spec/openclaw-v1/011-pipeline-manifest.md §validation-rules
 *
 * Rules the substrate enforces (everything that doesn't require I/O):
 *   - Single orchestrator (exactly one agent has is_orchestrator: true)
 *   - Orchestrator existence: orchestrator.agent_id ∈ agents[].id
 *   - Routing rule specialists ∈ agents[].id (and `then` chains)
 *   - Failure policy targets ∈ agents[].id
 *   - Privileged agents have non-empty extended_scopes (also schema-enforced)
 *   - Memory authority complete: every (tier, lane) referenced by routing
 *     specialists has at least one Tier-1 writer in the lane
 *   - Custom-hook usage: every `hooks[].name` matching `custom:*` has a
 *     matching `custom_hooks[]` declaration
 *
 * Rules deferred to filesystem-layer adapters (out of substrate scope):
 *   - Agent workspace exists (path on disk)
 *   - Hook handler files exist
 *   - Custom marker schemas resolve
 *   - Eval suite ref resolves to a file
 *   - Checksum matches the recomputed pipeline state
 */

import { PipelineManifestSchema } from "./schemas";
import type { PipelineManifest } from "./types";

// ─── Validation findings ──────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export interface ValidationFinding {
  readonly severity: ValidationSeverity;
  readonly rule: string;
  readonly message: string;
  /** Optional path within the manifest (e.g., "routing.rules[2].specialist"). */
  readonly path?: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly findings: ReadonlyArray<ValidationFinding>;
  readonly errors: number;
  readonly warnings: number;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Validate a pipeline manifest against substrate-enforceable rules.
 * Returns a report; does not throw. Schema-level errors (missing
 * required fields, malformed values) are surfaced as findings with
 * rule="schema" so the caller doesn't need a separate parse step.
 */
export function validatePipelineManifest(input: unknown): ValidationReport {
  const findings: ValidationFinding[] = [];

  const parsed = PipelineManifestSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({
        severity: "error",
        rule: "schema",
        message: issue.message,
        path: issue.path.join(".") || undefined,
      });
    }
    return summarise(findings);
  }

  const manifest = parsed.data as unknown as PipelineManifest;

  // Cross-validation rules — only run when schema parse succeeds, since
  // they assume well-formed input.
  checkSingleOrchestrator(manifest, findings);
  checkOrchestratorExistence(manifest, findings);
  checkRoutingSpecialistsExist(manifest, findings);
  checkFailurePolicyTargetsExist(manifest, findings);
  checkPrivilegedScopes(manifest, findings);
  checkMemoryAuthorityCompleteness(manifest, findings);
  checkCustomHookCoverage(manifest, findings);

  return summarise(findings);
}

/** Throwing variant: aborts with PipelineManifestInvalidError on any error finding. */
export function assertValidPipelineManifest(input: unknown): PipelineManifest {
  const report = validatePipelineManifest(input);
  if (!report.ok) {
    throw new PipelineManifestInvalidError(report);
  }
  return input as PipelineManifest;
}

export class PipelineManifestInvalidError extends Error {
  readonly category = "manifest_invalid" as const;
  constructor(public readonly report: ValidationReport) {
    const errorLines = report.findings
      .filter((f) => f.severity === "error")
      .slice(0, 10)
      .map((f) => `[${f.rule}${f.path ? ` @ ${f.path}` : ""}] ${f.message}`)
      .join("; ");
    super(
      `pipeline manifest invalid (${report.errors} error${report.errors === 1 ? "" : "s"}, ${report.warnings} warning${report.warnings === 1 ? "" : "s"}): ${errorLines}`,
    );
    this.name = "PipelineManifestInvalidError";
  }
}

// ─── Individual rule checks ───────────────────────────────────────────

function checkSingleOrchestrator(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  const orchestrators = m.agents.filter((a) => a.is_orchestrator === true);
  if (orchestrators.length === 0) {
    findings.push({
      severity: "error",
      rule: "single-orchestrator",
      message:
        "no agent declares is_orchestrator:true; pipelines must have exactly one",
      path: "agents",
    });
    return;
  }
  if (orchestrators.length > 1) {
    findings.push({
      severity: "error",
      rule: "single-orchestrator",
      message: `${orchestrators.length} agents declare is_orchestrator:true; only one is allowed (${orchestrators
        .map((a) => a.id)
        .join(", ")})`,
      path: "agents",
    });
  }
}

function checkOrchestratorExistence(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  const ids = new Set(m.agents.map((a) => a.id));
  if (!ids.has(m.orchestrator.agent_id)) {
    findings.push({
      severity: "error",
      rule: "orchestrator-existence",
      message: `orchestrator.agent_id "${m.orchestrator.agent_id}" not found in agents[]`,
      path: "orchestrator.agent_id",
    });
    return;
  }
  // Also enforce: the agent the orchestrator points to must actually be
  // declared as is_orchestrator:true.
  const target = m.agents.find((a) => a.id === m.orchestrator.agent_id);
  if (target && target.is_orchestrator !== true) {
    findings.push({
      severity: "error",
      rule: "orchestrator-flag",
      message: `agent "${target.id}" is referenced as orchestrator but does not declare is_orchestrator:true`,
      path: `agents[id=${target.id}]`,
    });
  }
}

function checkRoutingSpecialistsExist(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  const ids = new Set(m.agents.map((a) => a.id));
  m.routing.rules.forEach((rule, i) => {
    const path = `routing.rules[${i}]`;
    if (rule.specialist && !ids.has(rule.specialist)) {
      findings.push({
        severity: "error",
        rule: "routing-specialist-exists",
        message: `routing rule references unknown specialist "${rule.specialist}"`,
        path: `${path}.specialist`,
      });
    }
    if (rule.specialists) {
      for (const s of rule.specialists) {
        if (!ids.has(s)) {
          findings.push({
            severity: "error",
            rule: "routing-specialist-exists",
            message: `routing rule references unknown specialist "${s}"`,
            path: `${path}.specialists`,
          });
        }
      }
    }
    if (rule.fan_out && !ids.has(rule.fan_out.specialist)) {
      findings.push({
        severity: "error",
        rule: "routing-specialist-exists",
        message: `fan_out references unknown specialist "${rule.fan_out.specialist}"`,
        path: `${path}.fan_out.specialist`,
      });
    }
    if (rule.then && !ids.has(rule.then)) {
      findings.push({
        severity: "warning",
        rule: "routing-then-exists",
        message: `routing.then references "${rule.then}" — not in agents[]; if this is a skill name, ensure your runtime resolves it`,
        path: `${path}.then`,
      });
    }
  });
}

function checkFailurePolicyTargetsExist(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  const ids = new Set(m.agents.map((a) => a.id));
  for (const target of Object.keys(m.failure_policy)) {
    if (!ids.has(target)) {
      findings.push({
        severity: "error",
        rule: "failure-policy-target",
        message: `failure_policy targets unknown specialist "${target}"`,
        path: `failure_policy.${target}`,
      });
    }
  }
}

function checkPrivilegedScopes(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  // Schema also enforces this via .refine, but we surface a manifest-
  // level finding here so reviewers see the full picture in one report.
  m.agents.forEach((a) => {
    if (
      a.privileged === true &&
      (!a.extended_scopes || a.extended_scopes.length === 0)
    ) {
      findings.push({
        severity: "error",
        rule: "privileged-scopes",
        message: `privileged agent "${a.id}" must declare non-empty extended_scopes`,
        path: `agents[id=${a.id}]`,
      });
    }
  });
}

function checkMemoryAuthorityCompleteness(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  // For every lane that ANY non-Tier-1 row uses, at least one Tier-1 row
  // must exist on the same lane. Without a Tier-1 writer, Tier-2/3
  // proposals have nowhere to route for confirmation.
  const tier1Lanes = new Set<string>();
  const allLanes = new Set<string>();
  for (const row of m.memory_authority) {
    allLanes.add(row.lane);
    if (row.tier === 1) tier1Lanes.add(row.lane);
  }
  for (const lane of allLanes) {
    if (!tier1Lanes.has(lane)) {
      findings.push({
        severity: "error",
        rule: "memory-authority-completeness",
        message: `lane "${lane}" has Tier-2 or Tier-3 writers but no Tier-1 writer; proposals cannot be routed for confirmation`,
        path: "memory_authority",
      });
    }
  }
}

function checkCustomHookCoverage(
  m: PipelineManifest,
  findings: ValidationFinding[],
): void {
  // Every hook with a `custom:` name must have a matching custom_hooks[]
  // declaration carrying its payload schema.
  const declared = new Set(m.custom_hooks.map((c) => c.name));
  m.hooks.forEach((h, i) => {
    if (h.name.startsWith("custom:") && !declared.has(h.name)) {
      findings.push({
        severity: "error",
        rule: "custom-hook-declaration",
        message: `hook "${h.name}" is custom but no matching custom_hooks[] declaration was found`,
        path: `hooks[${i}].name`,
      });
    }
  });
  // Also: declared custom hooks should be referenced somewhere — either
  // by a registered handler (above) or fired by skill code. We can only
  // verify the handler side; the skill-code side is filesystem-layer.
  const used = new Set(m.hooks.map((h) => h.name));
  m.custom_hooks.forEach((c, i) => {
    if (!used.has(c.name)) {
      findings.push({
        severity: "warning",
        rule: "custom-hook-unused",
        message: `custom_hook "${c.name}" is declared but no hooks[] entry registers a handler — pipeline may still fire it from skill code`,
        path: `custom_hooks[${i}].name`,
      });
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function summarise(findings: ValidationFinding[]): ValidationReport {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
  }
  return {
    ok: errors === 0,
    findings,
    errors,
    warnings,
  };
}
