import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockReadWorkspaceFile = mock<(sandboxId: string, path: string) => Promise<string | null>>();
const mockSendToForgeSandboxChat = mock(async () => ({ content: "Fixed." }));

mock.module("./workspace-writer", () => ({
  readWorkspaceFile: mockReadWorkspaceFile,
  writeWorkspaceFiles: mock(async () => {}),
}));
mock.module("./api", () => ({
  sendToForgeSandboxChat: mockSendToForgeSandboxChat,
}));
mock.module("uuid", () => ({ v4: () => "test-uuid" }));

const mockFetch = mock(async () =>
  new Response(JSON.stringify({ checks: [], passCount: 0, failCount: 0, overallStatus: "pass", autoFixAttempts: 0, autoFixSuccesses: 0, timestamp: new Date().toISOString() }), { status: 200 }),
);
globalThis.fetch = mockFetch as unknown as typeof fetch;

const { runValidation, runDeepValidationWithAutoFix } = await import("./build-validator");
import type { BuildManifest, ArchitecturePlan } from "./types";

beforeEach(() => { mockReadWorkspaceFile.mockReset(); });

function makePlan(overrides?: Partial<ArchitecturePlan>): ArchitecturePlan {
  return { agentName: "test-agent", skills: [], apiEndpoints: [], dashboardPages: [], dataSchema: { tables: [] }, ...overrides } as ArchitecturePlan;
}
function makeManifest(overrides?: Partial<BuildManifest>): BuildManifest {
  return { startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), tasks: [], ...overrides } as BuildManifest;
}

describe("runValidation", () => {
  test("passes when all planned files exist", async () => {
    mockReadWorkspaceFile.mockImplementation(async () => "file content");
    const report = await runValidation("sandbox-1",
      makeManifest({ tasks: [{ specialist: "backend", status: "done", files: ["backend/index.ts"], startedAt: "", completedAt: "" }] }),
      makePlan({
        skills: [{ id: "skill-1", name: "Skill 1", description: "", dependencies: [], envVars: [] }],
        apiEndpoints: [{ method: "GET", path: "/api/test", description: "" }],
        dashboardPages: [{ path: "/test", title: "Test", components: [] }],
      }),
    );
    expect(report.overallStatus).toBe("pass");
    expect(report.planSkillsCovered).toBe(1);
  });

  test("reports missing skills", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_id: string, path: string) => path.includes("SKILL.md") ? null : "content");
    const report = await runValidation("sandbox-1", makeManifest(),
      makePlan({ skills: [{ id: "missing-skill", name: "Missing", description: "", dependencies: [], envVars: [] }] }),
    );
    expect(report.planSkillsMissing).toContain("missing-skill");
  });

  test("reports missing manifest files as failure", async () => {
    mockReadWorkspaceFile.mockImplementation(async () => null);
    const report = await runValidation("sandbox-1",
      makeManifest({ tasks: [{ specialist: "backend", status: "done", files: ["backend/missing.ts"], startedAt: "", completedAt: "" }] }),
      makePlan(),
    );
    expect(report.overallStatus).toBe("fail");
    expect(report.manifestFilesMissing).toContain("backend/missing.ts");
  });

  test("warns for plan items missing but manifest consistent", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_id: string, path: string) => path.includes("SKILL.md") ? null : "content");
    const report = await runValidation("sandbox-1", makeManifest({ tasks: [] }),
      makePlan({ skills: [{ id: "planned-skill", name: "Planned", description: "", dependencies: [], envVars: [] }] }),
    );
    expect(report.overallStatus).toBe("warn");
  });

  test("passes with empty plan and empty manifest", async () => {
    const report = await runValidation("sandbox-1", makeManifest(), makePlan());
    expect(report.overallStatus).toBe("pass");
    expect(report.planSkillsCovered).toBe(0);
    expect(report.planEndpointsCovered).toBe(0);
  });

  test("reports missing API endpoints", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_id: string, path: string) =>
      path.includes("backend/routes") ? null : "content",
    );
    const report = await runValidation("sandbox-1", makeManifest(),
      makePlan({ apiEndpoints: [{ method: "GET", path: "/api/campaigns", description: "" }] }),
    );
    expect(report.planEndpointsMissing).toContain("/api/campaigns");
  });

  test("reports missing dashboard pages", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_id: string, path: string) =>
      path.includes("dashboard/pages") ? null : "content",
    );
    const report = await runValidation("sandbox-1", makeManifest(),
      makePlan({ dashboardPages: [{ path: "/overview", title: "Overview", components: [] }] }),
    );
    expect(report.planPagesMissing).toContain("/overview");
  });
});

describe("runDeepValidationWithAutoFix", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test("returns pass report when validation endpoint returns pass", async () => {
    const passReport = {
      checks: [],
      passCount: 0,
      failCount: 0,
      overallStatus: "pass",
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      timestamp: new Date().toISOString(),
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(passReport), { status: 200 }),
    );

    const result = await runDeepValidationWithAutoFix("sandbox-1", makePlan());
    expect(result.overallStatus).toBe("pass");
    expect(result.autoFixAttempts).toBe(0);
  });

  test("returns empty pass report when validation endpoint throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const statusMessages: string[] = [];
    const result = await runDeepValidationWithAutoFix("sandbox-1", makePlan(), {
      onStatus: (msg) => statusMessages.push(msg),
    });

    expect(result.overallStatus).toBe("pass");
    expect(result.checks).toEqual([]);
    expect(statusMessages.some((m) => m.includes("unavailable"))).toBe(true);
  });

  test("returns fail report when validation endpoint returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    const result = await runDeepValidationWithAutoFix("sandbox-1", makePlan(), {
      onStatus: () => {},
    });
    // Should have returned the empty fallback pass (since it throws on non-ok)
    expect(result.checks).toEqual([]);
  });

  test("attempts auto-fix for failing checks and re-validates", async () => {
    const failReport = {
      checks: [
        {
          check: "api_connectivity",
          endpoint: "/api/campaigns",
          label: "API: /api/campaigns",
          status: "fail",
          fixContext: "Fix the /api/campaigns route",
        },
      ],
      passCount: 0,
      failCount: 1,
      overallStatus: "fail",
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      timestamp: new Date().toISOString(),
    };
    const passReport = {
      checks: [
        {
          check: "api_connectivity",
          endpoint: "/api/campaigns",
          label: "API: /api/campaigns",
          status: "pass",
        },
      ],
      passCount: 1,
      failCount: 0,
      overallStatus: "pass",
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      timestamp: new Date().toISOString(),
    };

    // First call: fail, second: restart, third: re-validate pass
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(failReport), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // restart services
      .mockResolvedValueOnce(new Response(JSON.stringify(passReport), { status: 200 })); // re-validate

    mockSendToForgeSandboxChat.mockResolvedValueOnce({ content: "Fixed." });

    const statusMessages: string[] = [];
    const result = await runDeepValidationWithAutoFix("sandbox-1", makePlan(), {
      onStatus: (msg) => statusMessages.push(msg),
    });

    expect(result.overallStatus).toBe("pass");
    expect(mockSendToForgeSandboxChat).toHaveBeenCalled();
  });

  test("stops early when no failures have fixContext", async () => {
    const failReport = {
      checks: [
        {
          check: "api_connectivity",
          endpoint: "/api/campaigns",
          label: "API: /api/campaigns",
          status: "fail",
          // No fixContext — cannot auto-fix
        },
      ],
      passCount: 0,
      failCount: 1,
      overallStatus: "fail",
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      timestamp: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(failReport), { status: 200 }));

    const result = await runDeepValidationWithAutoFix("sandbox-1", makePlan());
    expect(result.overallStatus).toBe("fail");
    expect(result.autoFixAttempts).toBe(0);
  });

  test("calls onCheckResult for each check", async () => {
    const report = {
      checks: [
        { check: "db", endpoint: "/", label: "DB", status: "pass" },
        { check: "api", endpoint: "/api/test", label: "API", status: "pass" },
      ],
      passCount: 2,
      failCount: 0,
      overallStatus: "pass",
      autoFixAttempts: 0,
      autoFixSuccesses: 0,
      timestamp: new Date().toISOString(),
    };
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(report), { status: 200 }));

    const checks: unknown[] = [];
    await runDeepValidationWithAutoFix("sandbox-1", makePlan(), {
      onCheckResult: (check) => checks.push(check),
    });

    expect(checks).toHaveLength(2);
  });
});
