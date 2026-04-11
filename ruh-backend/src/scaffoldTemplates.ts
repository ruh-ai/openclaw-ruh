/**
 * scaffold-templates.ts — Generate boilerplate files from the ArchitecturePlan.
 *
 * These are deterministic (no LLM). They produce the foundational files
 * that every deployable agent template needs: package.json, Dockerfile,
 * docker-compose.yml, .env.example, tsconfig.json, .gitignore, README.md.
 */

// Inline types — no dependency on frontend modules
interface ArchitecturePlanSkill { id: string; name: string; description: string; dependencies: string[]; envVars: string[]; toolType?: string; externalApi?: string }
interface ArchitecturePlanEnvVar { key: string; label: string; description: string; required: boolean; inputType: string; group: string; example?: string; defaultValue?: string }
interface DashboardPageComponent { type: string; title?: string; dataSource: string; config?: Record<string, unknown> }
interface DashboardPage { path: string; title: string; description?: string; components: DashboardPageComponent[] }
interface ApiEndpoint { method: string; path: string; description: string; query?: string; responseShape?: string }
interface DataSchema { tables: Array<{ name: string; columns: Array<{ name: string; type?: string; description?: string }>; indexes?: Array<{ columns: string[] }> }> }

export interface ArchitecturePlan {
  skills: ArchitecturePlanSkill[];
  workflow: { steps: Array<{ skillId: string; parallel?: boolean }> };
  integrations: Array<{ name: string; method: string }>;
  triggers: Array<{ type: string; config?: Record<string, unknown> }>;
  channels: string[];
  envVars: ArchitecturePlanEnvVar[];
  subAgents: Array<{ id: string; name: string }>;
  missionControl: unknown;
  soulContent?: string;
  dataSchema?: DataSchema | null;
  apiEndpoints?: ApiEndpoint[];
  dashboardPages?: DashboardPage[];
  vectorCollections?: Array<{ name: string; description: string }>;
  buildDependencies?: Array<{ from: string; to: string }>;
}

// Minimal normalizePlan — fills missing fields
function normalizePlan(raw: Record<string, unknown>): ArchitecturePlan {
  return {
    skills: (raw.skills as ArchitecturePlanSkill[]) ?? [],
    workflow: (raw.workflow as ArchitecturePlan['workflow']) ?? { steps: [] },
    integrations: (raw.integrations as ArchitecturePlan['integrations']) ?? [],
    triggers: (raw.triggers as ArchitecturePlan['triggers']) ?? [],
    channels: (raw.channels as string[]) ?? [],
    envVars: (raw.envVars as ArchitecturePlanEnvVar[]) ?? [],
    subAgents: (raw.subAgents as ArchitecturePlan['subAgents']) ?? [],
    missionControl: raw.missionControl ?? null,
    soulContent: raw.soulContent as string | undefined,
    dataSchema: (raw.dataSchema as DataSchema | null) ?? null,
    apiEndpoints: (raw.apiEndpoints as ApiEndpoint[]) ?? [],
    dashboardPages: (raw.dashboardPages as DashboardPage[]) ?? [],
    vectorCollections: (raw.vectorCollections as ArchitecturePlan['vectorCollections']) ?? [],
    buildDependencies: (raw.buildDependencies as ArchitecturePlan['buildDependencies']) ?? [],
  };
}

interface ScaffoldFile {
  path: string;
  content: string;
}

// ─── Package.json ────────────────────────────────────────────────────────────

function generatePackageJson(plan: ArchitecturePlan, agentName: string): ScaffoldFile {
  const deps: Record<string, string> = {
    express: "^4.21.0",
    cors: "^2.8.5",
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
      "@types/express": "^4.17.0",
      "@types/cors": "^2.8.0",
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

  // Dashboard build step — compiles React → static HTML/JS
  if (hasDashboard) {
    setup.push({
      name: "dashboard-build",
      command: "cd dashboard && npx vite build --outDir dist 2>&1",
      condition: "file:dashboard/index.html",
      optional: true,
    });
  }

  // Single-port architecture: the backend serves both API AND dashboard static files.
  // No separate serve process — eliminates CORS, SPA routing, and proxy issues.
  const services: Array<{ name: string; command: string; port: number; healthCheck?: string; optional?: boolean }> = [];
  if (hasBackend || hasDashboard) {
    services.push({
      name: "backend",
      command: "env PORT=3100 npx tsx backend/index.ts",
      port: 3100,
      healthCheck: "/health",
    });
    // Register dashboard on the same port so the builder tab discovers it
    if (hasDashboard) {
      services.push({ name: "dashboard", command: "", port: 3100, optional: true });
    }
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

// ─── Dashboard template generator ───────────────────────────────────────────
// Generates a COMPLETE working dashboard from the architecture plan.
// Every file is deterministic (no LLM). The dashboard works immediately
// after scaffold + npm install + vite build.

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function pascalCase(title: string): string {
  return title.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
}

function hookName(dataSource: string): string {
  // /api/amazon/overview → useAmazonOverview
  const parts = dataSource.replace(/^\/api\//, "").split(/[/?]/).filter(Boolean).filter(p => !p.startsWith(":"));
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return `use${name || "Data"}`;
}

function generateDashboardFiles(plan: ArchitecturePlan): ScaffoldFile[] {
  if (!(plan.dashboardPages?.length)) return [];
  const pages = plan.dashboardPages;
  const files: ScaffoldFile[] = [];

  // ── index.html ──
  files.push({
    path: "dashboard/index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <base href="/">
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
  });

  // ── vite.config.ts ──
  files.push({
    path: "dashboard/vite.config.ts",
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 3200 },
});
`,
  });

  // ── components/types.ts ──
  files.push({
    path: "dashboard/components/types.ts",
    content: `export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}
`,
  });

  // ── components/ui.ts — design tokens + shared styles ──
  files.push({
    path: "dashboard/components/ui.ts",
    content: `import type { CSSProperties } from 'react';

export const tokens = {
  primary: '#ae00d0',
  primaryHover: '#9400b4',
  secondary: '#7b5aff',
  background: '#f9f7f9',
  cardColor: '#ffffff',
  sidebarBg: '#fdfbff',
  textPrimary: '#121212',
  textSecondary: '#4b5563',
  textTertiary: '#9ca3af',
  borderDefault: '#e5e7eb',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  gradient: 'linear-gradient(135deg, #ae00d0, #7b5aff)',
};

export const pageStyle: CSSProperties = { padding: 24, maxWidth: 1200 };
export const cardStyle: CSSProperties = { background: tokens.cardColor, border: \`1px solid \${tokens.borderDefault}\`, borderRadius: 12, padding: 20, marginBottom: 16 };
export const headingStyle: CSSProperties = { fontSize: 20, fontWeight: 700, color: tokens.textPrimary, marginBottom: 4 };
export const subheadingStyle: CSSProperties = { fontSize: 13, color: tokens.textSecondary, marginBottom: 20 };
export const gridStyle = (cols: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: \`repeat(\${cols}, 1fr)\`, gap: 16, marginBottom: 24 });

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: tokens.textTertiary }}>{label}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div style={{ ...cardStyle, borderColor: tokens.error, color: tokens.error }}>{message}</div>;
}
export function EmptyState({ title = 'No data', description = '' }: { title?: string; description?: string }) {
  return <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontWeight: 600, color: tokens.textSecondary }}>{title}</div>{description && <div style={{ fontSize: 13, color: tokens.textTertiary, marginTop: 4 }}>{description}</div>}</div>;
}
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return <div style={{ marginBottom: 24 }}><h1 style={headingStyle}>{title}</h1>{description && <p style={subheadingStyle}>{description}</p>}</div>;
}
`,
  });

  // ── components/MetricCard.tsx ──
  files.push({
    path: "dashboard/components/MetricCard.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

export function MetricCard({ label, value, trend }: { label: string; value: string | number; trend?: string }) {
  return (
    <div style={{ ...cardStyle, borderLeft: \`4px solid \${tokens.primary}\`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: tokens.textPrimary }}>{value}</div>
      <div style={{ fontSize: 13, color: tokens.textSecondary }}>{label}</div>
      {trend && <div style={{ fontSize: 12, color: tokens.textTertiary }}>{trend}</div>}
    </div>
  );
}
`,
  });

  // ── components/DataTable.tsx ──
  files.push({
    path: "dashboard/components/DataTable.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

export function DataTable({ columns, rows, emptyMessage = 'No data' }: { columns: string[]; rows: Record<string, unknown>[]; emptyMessage?: string }) {
  if (!rows.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary, padding: 32 }}>{emptyMessage}</div>;
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', borderBottom: \`1px solid \${tokens.borderDefault}\`, fontWeight: 600, color: tokens.textSecondary, background: '#fafafa' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#fafafa' : 'white' }}>
              {columns.map((c) => <td key={c} style={{ padding: '10px 14px', borderBottom: \`1px solid \${tokens.borderDefault}\`, color: tokens.textPrimary }}>{String(row[c] ?? row[c.toLowerCase()] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TableStatus({ status }: { status: string }) {
  const color = status === 'active' ? tokens.success : status === 'error' ? tokens.error : tokens.warning;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: color + '18', color }}>{status}</span>;
}
`,
  });

  // ── components/ActivityFeed.tsx ──
  files.push({
    path: "dashboard/components/ActivityFeed.tsx",
    content: `import React from 'react';
import { tokens, cardStyle } from './ui';

interface FeedItem { id: string; title: string; description?: string; timestamp?: string; status?: string }

export function ActivityFeed({ items, emptyMessage = 'No recent activity yet' }: { items: FeedItem[]; emptyMessage?: string }) {
  if (!items.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary }}>{emptyMessage}</div>;
  return (
    <div style={cardStyle}>
      {items.map((item) => (
        <div key={item.id} style={{ padding: '10px 0', borderBottom: \`1px solid \${tokens.borderDefault}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontWeight: 500, color: tokens.textPrimary, fontSize: 13 }}>{item.title}</div>{item.description && <div style={{ fontSize: 12, color: tokens.textTertiary }}>{item.description}</div>}</div>
          {item.timestamp && <div style={{ fontSize: 11, color: tokens.textTertiary, whiteSpace: 'nowrap' }}>{item.timestamp}</div>}
        </div>
      ))}
    </div>
  );
}
`,
  });

  // ── components/BarChart.tsx + LineChart.tsx + PieChart.tsx ──
  const chartTemplate = (chartType: string) => `import React from 'react';
import { tokens, cardStyle } from './ui';

export function ${chartType}({ data, label = '' }: { data: Array<{ label: string; value: number }>; label?: string }) {
  if (!data.length) return <div style={{ ...cardStyle, textAlign: 'center', color: tokens.textTertiary }}>No chart data available</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={cardStyle}>
      {label && <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, marginBottom: 12 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', background: tokens.primary + '30', borderRadius: 4, height: Math.max(4, (d.value / max) * 100), transition: 'height 0.3s' }} />
            <div style={{ fontSize: 10, color: tokens.textTertiary, textAlign: 'center' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

  files.push({ path: "dashboard/components/BarChart.tsx", content: chartTemplate("BarChart") });
  files.push({ path: "dashboard/components/LineChart.tsx", content: chartTemplate("LineChart") });
  files.push({ path: "dashboard/components/PieChart.tsx", content: chartTemplate("PieChart") });

  // ── hooks/useApi.ts ──
  files.push({
    path: "dashboard/hooks/useApi.ts",
    content: `import { useEffect, useState } from 'react';
import type { AsyncState } from '../components/types';

export function useApi<T>(url: string, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: controller.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) throw new Error((json as {error?:{message?:string}})?.error?.message || 'Request failed');
        setState({ data: json as T, loading: false, error: null });
      })
      .catch(e => { if (active && !controller.signal.aborted) setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Unknown error' }); });
    return () => { active = false; controller.abort(); };
  }, deps);
  return state;
}
`,
  });

  // ── Collect unique data sources and generate hooks ──
  const seenHooks = new Set<string>();
  for (const page of pages) {
    for (const comp of page.components ?? []) {
      if (!comp.dataSource) continue;
      const name = hookName(comp.dataSource);
      if (seenHooks.has(name)) continue;
      seenHooks.add(name);
      const cleanPath = comp.dataSource.split("?")[0];
      files.push({
        path: `dashboard/hooks/${name}.ts`,
        content: `import { useApi } from './useApi';\n\nexport function ${name}() {\n  return useApi<Record<string, unknown>>('${cleanPath}');\n}\n`,
      });
    }
  }

  // ── layout.tsx ──
  const navItems = pages.map((p) => `  { href: '${p.path}', label: '${p.title}' },`).join("\n");
  files.push({
    path: "dashboard/layout.tsx",
    content: `import React, { type ReactNode } from 'react';
import { tokens } from './components/ui';

const navItems = [
${navItems}
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '240px 1fr', background: tokens.background, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <aside style={{ background: tokens.sidebarBg, borderRight: \`1px solid \${tokens.borderDefault}\`, padding: 20 }}>
        <div style={{ padding: '8px 10px 20px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: tokens.gradient, marginBottom: 14 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>Mission Control</div>
          <div style={{ color: tokens.textSecondary, fontSize: 14, marginTop: 4 }}>Agent operations</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {navItems.map((item) => {
            const active = currentPath === item.href || currentPath.startsWith(item.href + '/');
            return (
              <a key={item.href} href={item.href} style={{ display: 'block', padding: '11px 12px', borderRadius: 10, color: active ? tokens.primary : tokens.textSecondary, background: active ? 'rgba(174,0,208,0.08)' : 'transparent', textDecoration: 'none', fontSize: 14, fontWeight: active ? 600 : 400 }}>
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>
      <main style={{ padding: 0, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
`,
  });

  // ── main.tsx ──
  const pageImports = pages.map((p, i) => `import Page${i} from './pages/${slugify(p.title)}';`).join("\n");
  const pageRoutes = pages.map((p, i) => `          <Route path="${p.path}" element={<Page${i} />} />`).join("\n");

  files.push({
    path: "dashboard/main.tsx",
    content: `import { createRoot } from 'react-dom/client';
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
  });

  // ── Page files — one per dashboardPage ──
  for (const page of pages) {
    const pageSlug = slugify(page.title);
    const pageName = pascalCase(page.title) + "Page";

    // Collect hooks this page needs
    const pageHooks = new Map<string, string>();
    for (const comp of page.components ?? []) {
      if (!comp.dataSource) continue;
      const name = hookName(comp.dataSource);
      if (!pageHooks.has(name)) pageHooks.set(name, name);
    }

    const hookImports = Array.from(pageHooks.values()).map((h) => `import { ${h} } from '../hooks/${h}';`).join("\n");
    const hookCalls = Array.from(pageHooks.values()).map((h) => `  const ${h.replace(/^use/, "").charAt(0).toLowerCase() + h.replace(/^use/, "").slice(1)} = ${h}();`).join("\n");
    const firstHookVar = pageHooks.size > 0 ? (Array.from(pageHooks.values())[0].replace(/^use/, "").charAt(0).toLowerCase() + Array.from(pageHooks.values())[0].replace(/^use/, "").slice(1)) : null;

    // Determine which components to import
    const compTypes = new Set((page.components ?? []).map((c) => c.type));
    const compImports: string[] = [];
    if (compTypes.has("metric-cards")) compImports.push(`import { MetricCard } from '../components/MetricCard';`);
    if (compTypes.has("data-table")) compImports.push(`import { DataTable } from '../components/DataTable';`);
    if (compTypes.has("activity-feed")) compImports.push(`import { ActivityFeed } from '../components/ActivityFeed';`);
    if (compTypes.has("bar-chart")) compImports.push(`import { BarChart } from '../components/BarChart';`);
    if (compTypes.has("line-chart")) compImports.push(`import { LineChart } from '../components/LineChart';`);
    if (compTypes.has("pie-chart")) compImports.push(`import { PieChart } from '../components/PieChart';`);

    // Generate component usage
    const compUsage = (page.components ?? []).map((comp) => {
      const d = firstHookVar ? `${firstHookVar}.data` : "null";
      switch (comp.type) {
        case "metric-cards": return `      <div style={gridStyle(3)}>\n        <MetricCard label="Total" value={Object.values((${d} as Record<string,unknown>)?.metrics ?? {}).length} />\n      </div>`;
        case "data-table": return `      <DataTable columns={Object.keys(((${d} as Record<string,unknown>)?.items as Record<string,unknown>[])?.[0] ?? {})} rows={((${d} as Record<string,unknown>)?.items as Record<string,unknown>[]) ?? []} />`;
        case "activity-feed": return `      <ActivityFeed items={[]} />`;
        case "bar-chart": return `      <BarChart data={[]} label="${comp.title ?? "Chart"}" />`;
        case "line-chart": return `      <LineChart data={[]} label="${comp.title ?? "Trend"}" />`;
        case "pie-chart": return `      <PieChart data={[]} label="${comp.title ?? "Distribution"}" />`;
        default: return `      {/* ${comp.type} */}`;
      }
    }).join("\n");

    files.push({
      path: `dashboard/pages/${pageSlug}.tsx`,
      content: `import React from 'react';
import { pageStyle, gridStyle, LoadingState, ErrorState, EmptyState, PageHeader } from '../components/ui';
${compImports.join("\n")}
${hookImports}

export default function ${pageName}() {
${hookCalls}

${firstHookVar ? `  if (${firstHookVar}.loading) return <div style={pageStyle}><LoadingState /></div>;
  if (${firstHookVar}.error) return <div style={pageStyle}><ErrorState message={${firstHookVar}.error} /></div>;
  if (!${firstHookVar}.data) return <div style={pageStyle}><EmptyState /></div>;` : ""}

  return (
    <div style={pageStyle}>
      <PageHeader title="${page.title}" description="${page.description ?? ""}" />
${compUsage}
    </div>
  );
}
`,
    });
  }

  return files;
}

// ─── Backend entry file ─────────────────────────────────────────────────────
// Generates a working backend/index.ts that serves both API routes and
// the dashboard static files. The backend specialist only needs to fill in
// the route handler files — the framework is ready.

function generateBackendEntryFile(plan: ArchitecturePlan): ScaffoldFile | null {
  if (!(plan.apiEndpoints?.length) && !(plan.dashboardPages?.length)) return null;

  const hasDashboard = (plan.dashboardPages?.length ?? 0) > 0;

  // Group endpoints by their common path prefix to derive route files.
  // /api/amazon/overview and /api/amazon/listings → one "amazon" router
  const routeGroups = new Map<string, string>();
  for (const ep of plan.apiEndpoints ?? []) {
    const parts = ep.path.replace(/^\/api\//, "").split("/").filter((p) => p && !p.startsWith(":"));
    const group = parts[0] ?? "main"; // first path segment = route group
    if (!routeGroups.has(group)) {
      const varName = group.replace(/-./g, (m) => m[1].toUpperCase()) + "Router";
      routeGroups.set(group, varName);
    }
  }

  const routeImports = Array.from(routeGroups.entries()).map(([group, varName]) =>
    `import ${varName} from './routes/${group}';`
  ).join("\n");

  const routeMounts = Array.from(routeGroups.entries()).map(([group, varName]) =>
    `app.use('/api/${group}', ${varName});`
  ).join("\n");

  const dashboardServing = hasDashboard ? `
// Serve dashboard static files (single-port architecture)
const dashDist = path.join(process.cwd(), 'dashboard', 'dist');
app.use(express.static(dashDist));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { message: 'Not Found', code: 'NOT_FOUND' } });
  }
  res.sendFile(path.join(dashDist, 'index.html'));
});
` : `
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not Found', code: 'NOT_FOUND' } });
});
`;

  return {
    path: "backend/index.ts",
    content: `import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
${routeImports}

const app = express();
const port = Number(process.env.PORT || 3100);

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => { res.json({ ok: true }); });

// API routes
${routeMounts}
${dashboardServing}
// Error handler
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  res.status(500).json({ error: { message, code: 'INTERNAL_SERVER_ERROR' } });
});

app.listen(port, () => { console.log(\`Backend listening on port \${port}\`); });
export default app;
`,
  };
}

// ─── Placeholder route files ────────────────────────────────────────────────
// Generate stub route files so the backend starts immediately after scaffold.
// The backend specialist will overwrite these with real implementations.

function generatePlaceholderRoutes(plan: ArchitecturePlan): ScaffoldFile[] {
  if (!(plan.apiEndpoints?.length)) return [];

  // Group endpoints by first path segment (same logic as backend entry file)
  const groups = new Map<string, Array<{ method: string; subPath: string; description: string }>>();
  for (const ep of plan.apiEndpoints) {
    const parts = ep.path.replace(/^\/api\//, "").split("/").filter((p) => p && !p.startsWith(":"));
    const group = parts[0] ?? "main";
    if (!groups.has(group)) groups.set(group, []);
    const subPath = "/" + parts.slice(1).join("/").replace(/:[a-zA-Z]+/g, ":id") || "/";
    groups.get(group)!.push({ method: ep.method, subPath, description: ep.description });
  }

  const files: ScaffoldFile[] = [];
  for (const [group, endpoints] of groups) {
    const routes = endpoints.map((ep) => {
      const m = ep.method.toLowerCase();
      return `router.${m}('${ep.subPath}', (_req, res) => {\n  res.json({ placeholder: true, endpoint: '${ep.subPath}', description: '${ep.description.replace(/'/g, "\\'")}' });\n});`;
    }).join("\n\n");

    files.push({
      path: `backend/routes/${group}.ts`,
      content: `import { Router } from 'express';\n\nconst router = Router();\n\n${routes}\n\nexport default router;\n`,
    });
  }

  // Also generate placeholder auth middleware
  files.push({
    path: "backend/middleware/auth.ts",
    content: `import type { NextFunction, Request, Response } from 'express';

export function authMiddleware(_req: Request, _res: Response, next: NextFunction) {
  // Placeholder auth — the backend specialist will implement real auth
  next();
}
`,
  });

  return files;
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
  const backendEntry = generateBackendEntryFile(plan);
  return [
    generatePackageJson(plan, agentName),
    generateDockerfile(),
    generateDockerCompose(plan, agentName),
    generateEnvExample(plan),
    generateTsconfig(),
    generateGitignore(),
    generateReadme(plan, agentName),
    generateSetupJson(plan),
    ...(backendEntry ? [backendEntry] : []),
    ...generatePlaceholderRoutes(plan),
    ...generateDashboardFiles(plan),
  ];
}
