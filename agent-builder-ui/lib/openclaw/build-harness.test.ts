/**
 * build-harness.test.ts
 * Tests for generateVerificationPlan, reportToHarnessReport,
 * writeVerificationPlan, and readVerificationReport.
 */
import { describe, expect, mock, test, beforeEach } from "bun:test";
import type { ArchitecturePlan } from "./types";

const fetchMock = mock(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: fetchMock,
}));

const readWorkspaceFileMock = mock(async (_sandboxId: string, _path: string): Promise<string | null> => null);

mock.module("./workspace-writer", () => ({
  readWorkspaceFile: readWorkspaceFileMock,
  writeWorkspaceFile: mock(async () => {}),
}));

import { generateVerificationPlan, reportToHarnessReport, writeVerificationPlan, readVerificationReport } from "./build-harness";

// ─── Shared plan fixtures ────────────────────────────────────────────────────

const emptyPlan: ArchitecturePlan = {
  skills: [],
  workflow: { steps: [] },
  integrations: [],
  triggers: [],
  channels: [],
  envVars: [],
  subAgents: [],
  missionControl: null,
  dataSchema: null,
  apiEndpoints: [],
  dashboardPages: [],
  vectorCollections: [],
};

// ─── generateVerificationPlan ────────────────────────────────────────────────

describe("generateVerificationPlan", () => {
  test("always includes deps and compile checks", () => {
    const plan = generateVerificationPlan(emptyPlan, "TestAgent");
    const ids = plan.checks.map((c) => c.id);
    expect(ids).toContain("deps");
    expect(ids).toContain("compile");
  });

  test("sets agentName and generatedAt", () => {
    const plan = generateVerificationPlan(emptyPlan, "MyAgent");
    expect(plan.agentName).toBe("MyAgent");
    expect(typeof plan.generatedAt).toBe("string");
    // ISO8601
    expect(new Date(plan.generatedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  test("adds database check when dataSchema has tables", () => {
    const planWithDb: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "campaigns", description: "Ad campaigns" }] },
    };
    const vplan = generateVerificationPlan(planWithDb, "DbAgent");
    const ids = vplan.checks.map((c) => c.id);
    expect(ids).toContain("database");
  });

  test("omits database check when no dataSchema", () => {
    const vplan = generateVerificationPlan(emptyPlan, "NoDbAgent");
    const ids = vplan.checks.map((c) => c.id);
    expect(ids).not.toContain("database");
  });

  test("adds service_backend check when apiEndpoints present", () => {
    const planWithApi: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [{ method: "GET", path: "/api/health", description: "Health" }],
    };
    const vplan = generateVerificationPlan(planWithApi, "ApiAgent");
    const ids = vplan.checks.map((c) => c.id);
    expect(ids).toContain("service_backend");
  });

  test("adds endpoint checks for each GET endpoint", () => {
    const planWithApi: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [
        { method: "GET", path: "/api/campaigns", description: "List campaigns" },
        { method: "POST", path: "/api/campaigns", description: "Create campaign" },
      ],
    };
    const vplan = generateVerificationPlan(planWithApi, "ApiAgent");
    const ids = vplan.checks.map((c) => c.id);
    // Only GET endpoints get individual checks
    const endpointChecks = ids.filter((id) => id.startsWith("endpoint_GET"));
    expect(endpointChecks).toHaveLength(1);
    // POST does not get an endpoint check
    const postChecks = ids.filter((id) => id.startsWith("endpoint_POST"));
    expect(postChecks).toHaveLength(0);
  });

  test("adds dashboard checks when dashboardPages present", () => {
    const planWithDash: ArchitecturePlan = {
      ...emptyPlan,
      dashboardPages: [{ title: "Overview", path: "/", components: [] }],
    };
    const vplan = generateVerificationPlan(planWithDash, "DashAgent");
    const ids = vplan.checks.map((c) => c.id);
    expect(ids).toContain("dashboard_build");
    expect(ids).toContain("service_dashboard");
    expect(ids).toContain("dashboard_routes");
    expect(ids).toContain("dashboard_page_quality");
  });

  test("replaces path params with 'test' in endpoint commands", () => {
    const planWithParam: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [{ method: "GET", path: "/api/campaigns/:id", description: "Get campaign" }],
    };
    const vplan = generateVerificationPlan(planWithParam, "ParamAgent");
    const endpointCheck = vplan.checks.find((c) => c.id.startsWith("endpoint_GET"));
    expect(endpointCheck?.command).toContain("/api/campaigns/test");
    expect(endpointCheck?.command).not.toContain(":id");
  });

  test("deps check has maxAttempts 3", () => {
    const vplan = generateVerificationPlan(emptyPlan, "A");
    const deps = vplan.checks.find((c) => c.id === "deps");
    expect(deps?.maxAttempts).toBe(3);
  });

  test("compile check has maxAttempts 5", () => {
    const vplan = generateVerificationPlan(emptyPlan, "A");
    const compile = vplan.checks.find((c) => c.id === "compile");
    expect(compile?.maxAttempts).toBe(5);
  });
});

// ─── reportToHarnessReport ───────────────────────────────────────────────────

describe("reportToHarnessReport", () => {
  const basePlan = generateVerificationPlan(emptyPlan, "TestAgent");

  test("overall status is pass when all checks pass", () => {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass" as const, attempts: 1 },
        { id: "compile", status: "pass" as const, attempts: 1 },
      ],
      summary: { total: 2, pass: 2, fail: 0 },
    };
    const result = reportToHarnessReport(report, basePlan);
    expect(result.overallStatus).toBe("pass");
  });

  test("overall status is fail when any check fails", () => {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass" as const, attempts: 1 },
        { id: "compile", status: "fail" as const, attempts: 3, lastError: "TS2304: Cannot find name" },
      ],
      summary: { total: 2, pass: 1, fail: 1 },
    };
    const result = reportToHarnessReport(report, basePlan);
    expect(result.overallStatus).toBe("fail");
  });

  test("phases contain one entry per unique phase", () => {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass" as const, attempts: 1 },
        { id: "compile", status: "pass" as const, attempts: 1 },
      ],
      summary: { total: 2, pass: 2, fail: 0 },
    };
    const result = reportToHarnessReport(report, basePlan);
    const phases = result.phases.map((p) => p.phase);
    expect(phases).toContain("deps");
    expect(phases).toContain("compile");
    // No duplicates
    expect(new Set(phases).size).toBe(phases.length);
  });

  test("fixAttempts is 0 when check passed first time", () => {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [{ id: "deps", status: "pass" as const, attempts: 1 }],
      summary: { total: 1, pass: 1, fail: 0 },
    };
    const result = reportToHarnessReport(report, basePlan);
    const depsPhase = result.phases.find((p) => p.phase === "deps");
    expect(depsPhase?.fixAttempts).toBe(0);
  });

  test("fixAttempts increments for multiple attempts", () => {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [{ id: "compile", status: "pass" as const, attempts: 3, fixApplied: "Fixed tsconfig" }],
      summary: { total: 1, pass: 1, fail: 0 },
    };
    const result = reportToHarnessReport(report, basePlan);
    const compilePhase = result.phases.find((p) => p.phase === "compile");
    expect(compilePhase?.fixAttempts).toBe(2);
    expect(compilePhase?.fixSuccesses).toBe(1);
    expect(compilePhase?.detail).toContain("Fixed tsconfig");
  });

  test("skippedPhases lists phases not in the plan", () => {
    // basePlan (emptyPlan) has no dashboard, database, or endpoint checks
    const report = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass" as const, attempts: 1 },
        { id: "compile", status: "pass" as const, attempts: 1 },
      ],
      summary: { total: 2, pass: 2, fail: 0 },
    };
    const result = reportToHarnessReport(report, basePlan);
    expect(result.skippedPhases).toContain("dashboard_build");
    expect(result.skippedPhases).toContain("database");
    expect(result.skippedPhases).toContain("services");
    expect(result.skippedPhases).toContain("endpoints");
  });

  test("multiple endpoint checks aggregate into one phase", () => {
    const planWithTwo = generateVerificationPlan(
      {
        ...emptyPlan,
        apiEndpoints: [
          { method: "GET", path: "/api/a", description: "A" },
          { method: "GET", path: "/api/b", description: "B" },
        ],
      },
      "Agent",
    );

    const report = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass" as const, attempts: 1 },
        { id: "compile", status: "pass" as const, attempts: 1 },
        { id: "service_backend", status: "pass" as const, attempts: 1 },
        { id: "endpoint_GET_/api/a", status: "pass" as const, attempts: 1 },
        { id: "endpoint_GET_/api/b", status: "fail" as const, attempts: 2, lastError: "Not found" },
      ],
      summary: { total: 5, pass: 4, fail: 1 },
    };
    const result = reportToHarnessReport(report, planWithTwo);
    const endpointsPhase = result.phases.find((p) => p.phase === "endpoints");
    expect(endpointsPhase).toBeDefined();
    expect(endpointsPhase?.status).toBe("fail");
    expect(endpointsPhase?.errors.length).toBeGreaterThan(0);
  });
});

// ─── writeVerificationPlan ────────────────────────────────────────────────────

describe("writeVerificationPlan", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  test("calls fetchBackendWithAuth with exec endpoint", async () => {
    const plan = await writeVerificationPlan("sandbox-123", emptyPlan, "TestAgent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("sandbox-123");
    expect(url).toContain("exec");
  });

  test("returns a VerificationPlan with agentName and checks", async () => {
    const plan = await writeVerificationPlan("sb-1", emptyPlan, "MyAgent");
    expect(plan.agentName).toBe("MyAgent");
    expect(Array.isArray(plan.checks)).toBe(true);
  });

  test("sends the verification plan JSON in the exec command body", async () => {
    await writeVerificationPlan("sb-2", emptyPlan, "Agent");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.command).toContain("verification-plan.json");
  });
});

// ─── readVerificationReport ───────────────────────────────────────────────────

describe("readVerificationReport", () => {
  beforeEach(() => {
    readWorkspaceFileMock.mockClear();
  });

  test("returns null when no report file exists in workspace", async () => {
    readWorkspaceFileMock.mockImplementation(async () => null);
    const plan = generateVerificationPlan(emptyPlan, "Agent");
    const result = await readVerificationReport("sb-1", plan);
    expect(result).toBeNull();
  });

  test("returns null when file content is not valid JSON", async () => {
    readWorkspaceFileMock.mockImplementation(async () => "not json {{{");
    const plan = generateVerificationPlan(emptyPlan, "Agent");
    const result = await readVerificationReport("sb-1", plan);
    expect(result).toBeNull();
  });

  test("returns HarnessReport when valid report JSON is found", async () => {
    const mockReport = {
      timestamp: new Date().toISOString(),
      checks: [
        { id: "deps", status: "pass", attempts: 1 },
        { id: "compile", status: "pass", attempts: 1 },
      ],
      summary: { total: 2, pass: 2, fail: 0 },
    };
    readWorkspaceFileMock.mockImplementation(async () => JSON.stringify(mockReport));
    const plan = generateVerificationPlan(emptyPlan, "Agent");
    const result = await readVerificationReport("sb-1", plan);
    expect(result).not.toBeNull();
    expect(result?.overallStatus).toBe("pass");
  });
});
