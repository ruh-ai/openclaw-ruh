import { describe, expect, test, mock, beforeEach } from "bun:test";

const mockReadWorkspaceFile = mock<(sandboxId: string, path: string) => Promise<string | null>>();
mock.module("./workspace-writer", () => ({
  readWorkspaceFile: mockReadWorkspaceFile,
  writeWorkspaceFiles: mock(async () => {}),
}));
mock.module("./api", () => ({
  sendToForgeSandboxChat: mock(async () => ({ content: "Fixed." })),
}));
mock.module("uuid", () => ({ v4: () => "test-uuid" }));

const { runValidation } = await import("./build-validator");
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
});
