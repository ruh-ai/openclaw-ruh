/**
 * scaffold-templates.ts — Generate boilerplate files from the ArchitecturePlan.
 *
 * These are deterministic (no LLM). They produce the foundational files
 * that every deployable agent template needs: package.json, Dockerfile,
 * docker-compose.yml, .env.example, tsconfig.json, .gitignore, README.md.
 */

import type { ArchitecturePlan } from "./types";
import { normalizePlan } from "./plan-formatter";

interface ScaffoldFile {
  path: string;
  content: string;
}

// ─── Package.json ────────────────────────────────────────────────────────────

function generatePackageJson(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const deps: Record<string, string> = {
    express: "^5.1.0",
    dotenv: "^16.5.0",
  };

  // Add DB dependency if schema exists
  if (plan.dataSchema?.tables?.length) {
    deps["pg"] = "^8.16.0";
  }

  // Add dependencies from integrations
  for (const integration of plan.integrations) {
    if (integration.method === "mcp") {
      deps["@modelcontextprotocol/sdk"] = "^1.0.0";
    }
  }

  // Add vector DB dependency
  if (plan.vectorCollections?.length) {
    deps["chromadb"] = "^1.10.0";
  }

  // Add dashboard dependencies
  if (plan.dashboardPages?.length) {
    deps["react"] = "^19.1.0";
    deps["react-dom"] = "^19.1.0";
    deps["react-router-dom"] = "^7.6.0";
  }

  const kebabName = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const pkg = {
    name: kebabName || "openclaw-agent",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch backend/index.ts",
      start: "node --loader tsx backend/index.ts",
      "db:migrate": "tsx db/migrate.ts",
      build: "tsc",
      test: "vitest run",
    },
    dependencies: deps,
    devDependencies: {
      typescript: "^5.8.0",
      tsx: "^4.19.0",
      vitest: "^3.2.0",
      "@types/express": "^5.0.0",
      "@types/node": "^22.0.0",
      ...(plan.dataSchema?.tables?.length ? { "@types/pg": "^8.11.0" } : {}),
      ...(plan.dashboardPages?.length ? {
        "vite": "^6.3.0",
        "@vitejs/plugin-react": "^4.4.0",
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
      } : {}),
    },
  };

  return {
    path: "package.json",
    content: JSON.stringify(pkg, null, 2) + "\n",
  };
}

// ─── Dockerfile ──────────────────────────────────────────────────────────────

function generateDockerfile(): ScaffoldFile {
  return {
    path: "Dockerfile",
    content: `FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy workspace
COPY . .

# Runtime
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--loader", "tsx", "backend/index.ts"]
`,
  };
}

// ─── Docker Compose ──────────────────────────────────────────────────────────

function generateDockerCompose(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const kebabName = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;

  let content = `version: "3.8"

services:
  ${kebabName}:
    build: .
    ports:
      - "8080:8080"
    env_file: .env
`;

  if (hasDb) {
    content += `    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://agent:agent@postgres:5432/agent

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
      POSTGRES_DB: agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
`;
  }

  return { path: "docker-compose.yml", content };
}

// ─── .env.example ────────────────────────────────────────────────────────────

function generateEnvExample(plan: ArchitecturePlan): ScaffoldFile {
  const lines = ["# Environment variables for this agent", "# Copy to .env and fill in values", ""];

  if (plan.dataSchema?.tables?.length) {
    lines.push("# Database");
    lines.push("DATABASE_URL=postgresql://agent:agent@localhost:5432/agent");
    lines.push("");
  }

  if (plan.envVars.length > 0) {
    lines.push("# Agent credentials");
    for (const env of plan.envVars) {
      if (env.description) lines.push(`# ${env.description}`);
      lines.push(`${env.key}=${env.example ?? env.defaultValue ?? ""}`);
    }
    lines.push("");
  }

  lines.push("# Server");
  lines.push("PORT=8080");
  lines.push("NODE_ENV=development");
  lines.push("");

  return { path: ".env.example", content: lines.join("\n") };
}

// ─── tsconfig.json ───────────────────────────────────────────────────────────

function generateTsconfig(): ScaffoldFile {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      outDir: "./dist",
      rootDir: ".",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      declaration: true,
      paths: { "@/*": ["./*"] },
    },
    include: ["**/*.ts"],
    exclude: ["node_modules", "dist"],
  };
  return {
    path: "tsconfig.json",
    content: JSON.stringify(config, null, 2) + "\n",
  };
}

// ─── .gitignore ──────────────────────────────────────────────────────────────

function generateGitignore(): ScaffoldFile {
  return {
    path: ".gitignore",
    content: `node_modules/
dist/
.env
*.log
.DS_Store
`,
  };
}

// ─── README.md ───────────────────────────────────────────────────────────────

function generateReadme(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;
  const lines: string[] = [];

  lines.push(`# ${agentName}\n`);
  lines.push(`> Built with [Ruh.ai](https://ruh.ai) — digital employees with a soul.\n`);

  lines.push("## Quick Start\n");
  lines.push("```bash");
  lines.push("# Clone and install");
  lines.push("git clone <repo-url>");
  lines.push(`cd ${agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "agent"}`);
  lines.push("cp .env.example .env  # fill in your credentials");
  lines.push("npm install");
  if (hasDb) {
    lines.push("\n# Start database and run migrations");
    lines.push("docker-compose up -d postgres");
    lines.push("npm run db:migrate");
  }
  lines.push("\n# Start the agent");
  lines.push("npm run dev");
  lines.push("```\n");

  if (plan.skills.length > 0) {
    lines.push("## Skills\n");
    lines.push("| Skill | Description |");
    lines.push("|-------|-------------|");
    for (const s of plan.skills) {
      lines.push(`| ${s.name} | ${s.description} |`);
    }
    lines.push("");
  }

  if (plan.envVars.length > 0) {
    lines.push("## Environment Variables\n");
    lines.push("| Variable | Description | Required |");
    lines.push("|----------|-------------|----------|");
    for (const e of plan.envVars) {
      lines.push(`| \`${e.key}\` | ${e.description} | ${e.required ? "Yes" : "No"} |`);
    }
    lines.push("");
  }

  lines.push("## Architecture\n");
  lines.push("See `.openclaw/plan/PLAN.md` for the full architecture plan.");
  lines.push("See `.openclaw/discovery/PRD.md` and `TRD.md` for requirements.\n");

  return { path: "README.md", content: lines.join("\n") };
}

// ─── .openclaw/setup.json ────────────────────────────────────────────────────

function generateSetupJson(plan: ArchitecturePlan): ScaffoldFile {
  const hasDb = (plan.dataSchema?.tables?.length ?? 0) > 0;
  const hasBackend = (plan.apiEndpoints?.length ?? 0) > 0;
  const hasDashboard = (plan.dashboardPages?.length ?? 0) > 0;

  const setup: Array<{ name: string; command: string; condition?: string; optional?: boolean }> = [];
  if (hasDb) {
    setup.push({ name: "migrate", command: "npm run db:migrate", condition: "file:db/migrations" });
    setup.push({ name: "seed", command: "npm run db:seed", condition: "file:db/seed.ts", optional: true });
  }

  const services: Array<{ name: string; command: string; port: number; healthCheck?: string; optional?: boolean }> = [];
  if (hasBackend) {
    services.push({
      name: "backend",
      command: "PORT=3100 npx tsx backend/index.ts",
      port: 3100,
      healthCheck: "/health",
    });
  }
  if (hasDashboard) {
    // Build step compiles React → static HTML/JS before serving
    setup.push({
      name: "dashboard-build",
      command: "cd dashboard && npx vite build --outDir dist 2>&1",
      condition: "file:dashboard/index.html",
      optional: true,
    });
    services.push({
      name: "dashboard",
      command: "npx serve dashboard/dist -l 3200 -s --no-clipboard",
      port: 3200,
      optional: true,
    });
  }

  const manifest = {
    schemaVersion: 1,
    install: "NODE_ENV=development npm install",
    setup,
    services,
    requires: {
      postgres: hasDb,
      redis: false,
    },
  };

  return {
    path: ".openclaw/setup.json",
    content: JSON.stringify(manifest, null, 2) + "\n",
  };
}

// ─── Dashboard entry files ───────────────────────────────────────────────────

function generateDashboardEntryFiles(plan: ArchitecturePlan): ScaffoldFile[] {
  if (!(plan.dashboardPages?.length)) return [];

  const pages = plan.dashboardPages ?? [];
  const pageImports = pages.map((p, i) =>
    `import Page${i} from './pages/${p.title.replace(/[^a-zA-Z0-9]/g, "")}Page';`
  ).join("\n");
  const pageRoutes = pages.map((p, i) =>
    `      <Route path="${p.path}" element={<Page${i} />} />`
  ).join("\n");

  return [
    {
      path: "dashboard/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
`,
    },
    {
      path: "dashboard/main.tsx",
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layout';
${pageImports}

function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
${pageRoutes}
          <Route path="*" element={<Navigate to="${pages[0]?.path ?? "/"}" replace />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
    },
    {
      path: "dashboard/vite.config.ts",
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3200,
  },
});
`,
    },
  ];
}

// ─── Master function ─────────────────────────────────────────────────────────

/**
 * Generate all scaffold files from the architecture plan.
 * Returns an array of {path, content} ready for workspace-writer.
 */
export function generateScaffoldFiles(
  rawPlan: ArchitecturePlan,
  agentName: string,
): ScaffoldFile[] {
  // Normalize: fill missing fields to prevent crashes from architect omissions
  const plan = normalizePlan(rawPlan as unknown as Record<string, unknown>);
  return [
    generatePackageJson(plan, agentName),
    generateDockerfile(),
    generateDockerCompose(plan, agentName),
    generateEnvExample(plan),
    generateTsconfig(),
    generateGitignore(),
    generateReadme(plan, agentName),
    generateSetupJson(plan),
    ...generateDashboardEntryFiles(plan),
  ];
}
