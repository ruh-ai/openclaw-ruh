/**
 * scaffold-templates.test.ts
 * Tests for generateScaffoldFiles — the deterministic boilerplate generator.
 * No mocks needed; pure function.
 */
import { describe, expect, test } from "bun:test";
import type { ArchitecturePlan } from "./types";
import { generateScaffoldFiles } from "./scaffold-templates";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function findFile(files: ReturnType<typeof generateScaffoldFiles>, path: string) {
  return files.find((f) => f.path === path);
}

// ─── Basic structure ──────────────────────────────────────────────────────────

describe("generateScaffoldFiles — basic structure", () => {
  test("returns an array of file objects with path and content", () => {
    const files = generateScaffoldFiles(emptyPlan, "TestAgent");
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(typeof f.path).toBe("string");
      expect(typeof f.content).toBe("string");
    }
  });

  test("always includes the core scaffold files", () => {
    const files = generateScaffoldFiles(emptyPlan, "TestAgent");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("docker-compose.yml");
    expect(paths).toContain(".env.example");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain("README.md");
    expect(paths).toContain(".openclaw/setup.json");
  });

  test("all file paths are unique", () => {
    const files = generateScaffoldFiles(emptyPlan, "TestAgent");
    const paths = files.map((f) => f.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

// ─── package.json ─────────────────────────────────────────────────────────────

describe("generateScaffoldFiles — package.json", () => {
  test("includes express, cors, dotenv as base dependencies", () => {
    const files = generateScaffoldFiles(emptyPlan, "MyAgent");
    const pkgFile = findFile(files, "package.json");
    expect(pkgFile).toBeDefined();
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies).toHaveProperty("express");
    expect(pkg.dependencies).toHaveProperty("cors");
    expect(pkg.dependencies).toHaveProperty("dotenv");
  });

  test("adds pg dependency when plan has dataSchema tables", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "campaigns", description: "Ad campaigns" }] },
    };
    const files = generateScaffoldFiles(plan, "AdAgent");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.dependencies).toHaveProperty("pg");
  });

  test("adds chromadb when plan has vectorCollections", () => {
    const plan: ArchitecturePlan = { ...emptyPlan, vectorCollections: ["memories"] };
    const files = generateScaffoldFiles(plan, "MemAgent");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.dependencies).toHaveProperty("chromadb");
  });

  test("adds react dependencies when plan has dashboardPages", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dashboardPages: [{ title: "Overview", path: "/", components: [] }],
    };
    const files = generateScaffoldFiles(plan, "DashAgent");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
    expect(pkg.devDependencies).toHaveProperty("vite");
  });

  test("uses kebab-case agent name as package name", () => {
    const files = generateScaffoldFiles(emptyPlan, "Google Ads Agent");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.name).toBe("google-ads-agent");
  });

  test("defaults to openclaw-agent for blank name", () => {
    const files = generateScaffoldFiles(emptyPlan, "");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.name).toBe("openclaw-agent");
  });
});

// ─── docker-compose.yml ───────────────────────────────────────────────────────

describe("generateScaffoldFiles — docker-compose.yml", () => {
  test("includes postgres service when dataSchema has tables", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "orders", description: "Orders" }] },
    };
    const files = generateScaffoldFiles(plan, "OrderAgent");
    const dc = findFile(files, "docker-compose.yml")!.content;
    expect(dc).toContain("postgres:");
    expect(dc).toContain("pg_isready");
    expect(dc).toContain("pgdata:");
  });

  test("omits postgres when no dataSchema", () => {
    const files = generateScaffoldFiles(emptyPlan, "SimpleAgent");
    const dc = findFile(files, "docker-compose.yml")!.content;
    expect(dc).not.toContain("postgres:");
  });
});

// ─── .env.example ─────────────────────────────────────────────────────────────

describe("generateScaffoldFiles — .env.example", () => {
  test("includes DATABASE_URL when plan has tables", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "t", description: "t" }] },
    };
    const files = generateScaffoldFiles(plan, "DbAgent");
    const env = findFile(files, ".env.example")!.content;
    expect(env).toContain("DATABASE_URL=");
  });

  test("includes custom env vars from plan", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      envVars: [
        { key: "GOOGLE_ADS_TOKEN", description: "Google Ads API token", required: true, example: "tok_xxx" },
      ],
    };
    const files = generateScaffoldFiles(plan, "AdsAgent");
    const env = findFile(files, ".env.example")!.content;
    expect(env).toContain("GOOGLE_ADS_TOKEN=tok_xxx");
  });

  test("always includes PORT and NODE_ENV", () => {
    const files = generateScaffoldFiles(emptyPlan, "BasicAgent");
    const env = findFile(files, ".env.example")!.content;
    expect(env).toContain("PORT=");
    expect(env).toContain("NODE_ENV=");
  });
});

// ─── README.md ────────────────────────────────────────────────────────────────

describe("generateScaffoldFiles — README.md", () => {
  test("includes agent name as top-level heading", () => {
    const files = generateScaffoldFiles(emptyPlan, "Google Ads Agent");
    const readme = findFile(files, "README.md")!.content;
    expect(readme).toContain("# Google Ads Agent");
  });

  test("includes db:migrate step when dataSchema present", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "t", description: "" }] },
    };
    const files = generateScaffoldFiles(plan, "DbAgent");
    const readme = findFile(files, "README.md")!.content;
    expect(readme).toContain("db:migrate");
  });

  test("includes skills table when plan has skills", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      skills: [{ name: "Reporting", description: "Generates reports", dependencies: [], envVars: [] }],
    };
    const files = generateScaffoldFiles(plan, "SkillAgent");
    const readme = findFile(files, "README.md")!.content;
    expect(readme).toContain("## Skills");
    expect(readme).toContain("Reporting");
  });
});

// ─── .openclaw/setup.json ─────────────────────────────────────────────────────

describe("generateScaffoldFiles — setup.json", () => {
  test("schema version is 1", () => {
    const files = generateScaffoldFiles(emptyPlan, "Agent");
    const setup = JSON.parse(findFile(files, ".openclaw/setup.json")!.content);
    expect(setup.schemaVersion).toBe(1);
  });

  test("includes postgres:true when dataSchema has tables", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "t", description: "" }] },
    };
    const files = generateScaffoldFiles(plan, "DbAgent");
    const setup = JSON.parse(findFile(files, ".openclaw/setup.json")!.content);
    expect(setup.requires.postgres).toBe(true);
  });

  test("includes migrate step when dataSchema present", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dataSchema: { tables: [{ name: "t", description: "" }] },
    };
    const files = generateScaffoldFiles(plan, "DbAgent");
    const setup = JSON.parse(findFile(files, ".openclaw/setup.json")!.content);
    const names = setup.setup.map((s: { name: string }) => s.name);
    expect(names).toContain("migrate");
  });

  test("adds backend service when apiEndpoints present", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [{ method: "GET", path: "/api/health", description: "Health check" }],
    };
    const files = generateScaffoldFiles(plan, "ApiAgent");
    const setup = JSON.parse(findFile(files, ".openclaw/setup.json")!.content);
    const serviceNames = setup.services.map((s: { name: string }) => s.name);
    expect(serviceNames).toContain("backend");
  });
});

// ─── Backend entry file and routes ────────────────────────────────────────────

describe("generateScaffoldFiles — backend", () => {
  test("includes backend/index.ts when apiEndpoints present", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [{ method: "GET", path: "/api/campaigns", description: "List campaigns" }],
    };
    const files = generateScaffoldFiles(plan, "AdAgent");
    const backendEntry = findFile(files, "backend/index.ts");
    expect(backendEntry).toBeDefined();
    expect(backendEntry!.content).toContain("app.get('/health'");
  });

  test("generates placeholder route files for apiEndpoints", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [
        { method: "GET", path: "/api/campaigns", description: "List" },
        { method: "POST", path: "/api/campaigns", description: "Create" },
      ],
    };
    const files = generateScaffoldFiles(plan, "CampAgent");
    const routeFile = findFile(files, "backend/routes/campaigns.ts");
    expect(routeFile).toBeDefined();
    expect(routeFile!.content).toContain("router.get");
    expect(routeFile!.content).toContain("router.post");
  });

  test("generates auth middleware alongside routes", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      apiEndpoints: [{ method: "GET", path: "/api/data", description: "Data" }],
    };
    const files = generateScaffoldFiles(plan, "ApiAgent");
    const authFile = findFile(files, "backend/middleware/auth.ts");
    expect(authFile).toBeDefined();
  });
});

// ─── Dashboard files ──────────────────────────────────────────────────────────

describe("generateScaffoldFiles — dashboard", () => {
  test("generates dashboard/index.html and vite.config.ts when dashboardPages present", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dashboardPages: [{ title: "Overview", path: "/", components: [] }],
    };
    const files = generateScaffoldFiles(plan, "DashAgent");
    expect(findFile(files, "dashboard/index.html")).toBeDefined();
    expect(findFile(files, "dashboard/vite.config.ts")).toBeDefined();
    expect(findFile(files, "dashboard/main.tsx")).toBeDefined();
    expect(findFile(files, "dashboard/layout.tsx")).toBeDefined();
  });

  test("generates per-page component files", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dashboardPages: [
        { title: "Overview", path: "/", components: [] },
        { title: "Campaigns", path: "/campaigns", components: [] },
      ],
    };
    const files = generateScaffoldFiles(plan, "DashAgent");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("dashboard/pages/overview.tsx");
    expect(paths).toContain("dashboard/pages/campaigns.tsx");
  });

  test("generates data hooks for components with dataSource", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      dashboardPages: [
        {
          title: "Overview",
          path: "/",
          components: [
            { type: "metric-cards", title: "Metrics", dataSource: "/api/overview" },
          ],
        },
      ],
    };
    const files = generateScaffoldFiles(plan, "DashAgent");
    const hookFile = findFile(files, "dashboard/hooks/useOverview.ts");
    expect(hookFile).toBeDefined();
    expect(hookFile!.content).toContain("useOverview");
    expect(hookFile!.content).toContain("/api/overview");
  });

  test("omits all dashboard files when no dashboardPages", () => {
    const files = generateScaffoldFiles(emptyPlan, "NoUiAgent");
    const dashFiles = files.filter((f) => f.path.startsWith("dashboard/"));
    expect(dashFiles).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("generateScaffoldFiles — edge cases", () => {
  test("handles partial plan (as if architect omitted optional fields)", () => {
    // Simulates what normalizePlan fills in
    const partial = { skills: [] } as unknown as ArchitecturePlan;
    expect(() => generateScaffoldFiles(partial, "PartialAgent")).not.toThrow();
  });

  test("handles special characters in agent name gracefully", () => {
    const files = generateScaffoldFiles(emptyPlan, "My Agent (v2)!");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.name).toMatch(/^[a-z0-9-]+$/);
  });

  test("mcp integration adds @modelcontextprotocol/sdk dependency", () => {
    const plan: ArchitecturePlan = {
      ...emptyPlan,
      integrations: [{ name: "ToolKit", method: "mcp", envVars: [] }],
    };
    const files = generateScaffoldFiles(plan, "McpAgent");
    const pkg = JSON.parse(findFile(files, "package.json")!.content);
    expect(pkg.dependencies).toHaveProperty("@modelcontextprotocol/sdk");
  });
});
