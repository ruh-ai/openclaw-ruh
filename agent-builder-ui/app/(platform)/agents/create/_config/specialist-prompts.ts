/**
 * specialist-prompts.ts — Specialist prompts for the v3 build pipeline.
 *
 * Each specialist reads .openclaw/plan/architecture.json from the workspace
 * and writes code files for its domain. The architect agent has shell access
 * and writes files via `mkdir -p && cat > file << 'EOF'`.
 */

import type { ArchitecturePlan } from "@/lib/openclaw/types";

export type SpecialistType = "scaffold" | "identity" | "database" | "backend" | "skills" | "dashboard";

/**
 * Determine which specialists should run based on plan content.
 */
export function getRequiredSpecialists(plan: ArchitecturePlan): SpecialistType[] {
  const specialists: SpecialistType[] = ["identity", "skills"];

  if (plan.dataSchema?.tables?.length) {
    specialists.push("database");
  }
  if (plan.apiEndpoints?.length) {
    specialists.push("backend");
  }
  if (plan.dashboardPages?.length) {
    specialists.push("dashboard");
  }

  return specialists;
}

/**
 * Check if a plan requires the v3 build pipeline (has code-generating fields).
 */
export function isV3Build(plan: ArchitecturePlan | null | undefined): boolean {
  if (!plan) return false;
  return Boolean(
    plan.dataSchema?.tables?.length ||
    plan.apiEndpoints?.length ||
    plan.dashboardPages?.length,
  );
}

// ─── Identity Specialist ─────────────────────────────────────────────────────

export function buildIdentityPrompt(plan: ArchitecturePlan, agentName: string): string {
  return `[SPECIALIST: Identity Writer]

You are writing the identity files for the "${agentName}" agent.

First, read the architecture plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

Then write these files to the workspace:

1. **SOUL.md** — The agent's personality, mission, behavior rules, and workflow.
   Include: who the agent is, their tone, their expertise, what they do and don't do.

2. **AGENTS.md** — The agent manifest with skill inventory, tool connections, triggers, and workflow.

3. **IDENTITY.md** — A brief identity card: name, role, primary users, key capabilities.

Write each file using:
\`\`\`bash
cat > ~/.openclaw/workspace/SOUL.md << 'ENDSOUL'
[content]
ENDSOUL
\`\`\`

After writing all 3 files, confirm with:
\`\`\`json
{"type": "specialist_done", "specialist": "identity", "files": ["SOUL.md", "AGENTS.md", "IDENTITY.md"]}
\`\`\`

Agent name: ${agentName}
Skills: ${plan.skills.map((s) => s.name).join(", ")}
Channels: ${plan.channels.join(", ") || "none"}
`;
}

// ─── Database Specialist ─────────────────────────────────────────────────────

export function buildDatabasePrompt(plan: ArchitecturePlan): string {
  const tables = plan.dataSchema?.tables ?? [];
  const tableList = tables.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  return `[SPECIALIST: Database Engineer]

You are writing the database layer for this agent. The workspace has an architecture plan at:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

The plan specifies these tables:
${tableList}

Write these files:

1. **db/migrations/001_initial.sql** — CREATE TABLE statements with proper types, constraints, indexes, and foreign keys.

2. **db/types.ts** — TypeScript interfaces matching each table. Export one interface per table.

3. **db/seed.ts** — A seed script that inserts realistic sample data for development.

4. **db/migrate.ts** — A simple migration runner that reads .sql files from db/migrations/ and executes them against DATABASE_URL.

Use PostgreSQL syntax. Include created_at/updated_at timestamps on all tables.

Write each file:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/db/migrations
cat > ~/.openclaw/workspace/db/migrations/001_initial.sql << 'ENDSQL'
[SQL content]
ENDSQL
\`\`\`

After writing all files, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "database", "files": ["db/migrations/001_initial.sql", "db/types.ts", "db/seed.ts", "db/migrate.ts"]}
\`\`\`
`;
}

// ─── Backend Specialist ──────────────────────────────────────────────────────

export function buildBackendPrompt(plan: ArchitecturePlan): string {
  const endpoints = plan.apiEndpoints ?? [];
  const endpointList = endpoints.map((e) => `- ${e.method} ${e.path}: ${e.description}`).join("\n");

  return `[SPECIALIST: Backend Engineer]

You are writing the backend API layer. Read the architecture plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

${plan.dataSchema?.tables?.length ? "Also read the database types:\n```bash\ncat ~/.openclaw/workspace/db/types.ts\n```\n" : ""}

The plan specifies these endpoints:
${endpointList}

Write these files:

1. **backend/index.ts** — Express app entry point. Imports all routes, sets up middleware, starts server on PORT.

2. **backend/routes/*.ts** — One file per resource group (e.g., campaigns.ts, reports.ts). Each exports an Express Router.

3. **backend/services/*.ts** — Business logic functions called by routes. Each service file handles one domain.

4. **backend/middleware/auth.ts** — Simple auth middleware (check Bearer token or API key from env).

Use TypeScript, Express 5, async/await. Import types from db/types.ts if database exists.
Keep routes thin — delegate logic to services.
Return proper HTTP status codes and JSON error responses.

Write each file:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/backend/routes ~/.openclaw/workspace/backend/services ~/.openclaw/workspace/backend/middleware
cat > ~/.openclaw/workspace/backend/index.ts << 'ENDTS'
[content]
ENDTS
\`\`\`

After writing all files, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "backend", "files": ["backend/index.ts", ...]}
\`\`\`
`;
}

// ─── Skill Handler Specialist ────────────────────────────────────────────────

export function buildSkillHandlerPrompt(plan: ArchitecturePlan): string {
  const skillList = plan.skills.map((s) => `- ${s.id}: ${s.description} (env: ${s.envVars.join(", ") || "none"})`).join("\n");

  return `[SPECIALIST: Skill Builder]

You are writing TypeScript handler implementations for each skill. Read the plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

Skills to implement:
${skillList}

For EACH skill, write:

1. **skills/<skill-id>/handler.ts** — A TypeScript module that exports:
   - \`async function execute(input: SkillInput): Promise<SkillOutput>\`
   - Types for SkillInput and SkillOutput
   - Real implementation logic (API calls, data processing, etc.)
   - Error handling with descriptive messages

2. **skills/<skill-id>/handler.test.ts** — Basic test with vitest:
   - Test the happy path
   - Test error handling
   - Mock external dependencies

The handler should be the actual implementation, not a stub. Use the env vars and integrations from the plan.

Write each file:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/skills/<skill-id>
cat > ~/.openclaw/workspace/skills/<skill-id>/handler.ts << 'ENDTS'
[content]
ENDTS
\`\`\`

After writing all skill handlers, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "skills", "files": ["skills/<id>/handler.ts", ...]}
\`\`\`
`;
}

// ─── Dashboard Specialist ────────────────────────────────────────────────────

const DASHBOARD_DESIGN_TOKENS = `
DESIGN SYSTEM — You MUST follow these tokens exactly:

Colors:
  --primary: #ae00d0 (brand purple — use for active nav, buttons, links, accents)
  --primary-hover: #9400b4
  --secondary: #7b5aff
  --background: #f9f7f9 (warm light gray page background)
  --card-color: #ffffff (card/panel background)
  --sidebar-bg: #fdfbff
  --text-primary: #121212
  --text-secondary: #4b5563
  --text-tertiary: #9ca3af
  --border-default: #e5e7eb
  --success: #22c55e, --error: #ef4444, --warning: #f59e0b, --info: #3b82f6
  Brand gradient: linear-gradient(135deg, #ae00d0, #7b5aff)

Typography:
  Font family: system-ui, -apple-system, "Segoe UI", sans-serif
  Headings: font-weight 700, color --text-primary
  Body: font-weight 400, font-size 14px, color --text-secondary

Layout:
  Border radius: 12px cards, 8px buttons/inputs
  Sidebar: white (#fdfbff) background, 240px width, subtle right border
  Active nav item: --primary color text with light purple tint background (rgba(174,0,208,0.08))
  Cards: white background, 1px --border-default border, 12px radius
  Metric cards: white bg, left purple accent border, large number + label below

Rules:
  - LIGHT theme by default — do NOT use dark backgrounds (#0f172a, #111827, etc.)
  - Do NOT use Inter, Tailwind default blue, or cyan/teal accents
  - Status badges: pill shape with light tinted background + matching text color
`;

export function buildDashboardPrompt(plan: ArchitecturePlan): string {
  const pages = plan.dashboardPages ?? [];
  const pageList = pages.map((p) => `- ${p.title} (${p.path}): ${p.components.map((c) => c.type).join(", ")}`).join("\n");
  const endpoints = plan.apiEndpoints ?? [];

  return `[SPECIALIST: Frontend Engineer]

You are writing the agent's dashboard UI. Read the plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

Pages to build:
${pageList}

Available API endpoints:
${endpoints.map((e) => `- ${e.method} ${e.path}`).join("\n")}

${DASHBOARD_DESIGN_TOKENS}

Write these files:

1. **dashboard/layout.tsx** — Dashboard shell with navigation sidebar linking to all pages. Use the design tokens above for all styling.

2. **dashboard/pages/*.tsx** — One React component per page. Each page:
   - Fetches data from the corresponding API endpoint using the hooks
   - Renders the components specified in the plan (metric-cards, data-table, line-chart, etc.)
   - Handles loading, empty, and error states
   - Uses the design token colors and spacing

3. **dashboard/hooks/*.ts** — Data fetching hooks using fetch + useState/useEffect. One per API resource.

4. **dashboard/components/*.tsx** — Reusable components: MetricCard, DataTable, Chart. Style using the design tokens — white cards with purple accents, clean borders.

Use React 19, TypeScript, functional components. Keep it simple — no heavy UI library, just clean HTML + inline styles using the CSS custom properties above.

Write each file:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/dashboard/pages ~/.openclaw/workspace/dashboard/hooks ~/.openclaw/workspace/dashboard/components
cat > ~/.openclaw/workspace/dashboard/layout.tsx << 'ENDTSX'
[content]
ENDTSX
\`\`\`

After writing all files, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "dashboard", "files": ["dashboard/layout.tsx", ...]}
\`\`\`
`;
}

// ─── Prompt selector ─────────────────────────────────────────────────────────

export function getSpecialistPrompt(
  type: SpecialistType,
  plan: ArchitecturePlan,
  agentName: string,
): string {
  switch (type) {
    case "scaffold": return ""; // Scaffold is deterministic (no LLM) — handled by build-orchestrator
    case "identity": return buildIdentityPrompt(plan, agentName);
    case "database": return buildDatabasePrompt(plan);
    case "backend": return buildBackendPrompt(plan);
    case "skills": return buildSkillHandlerPrompt(plan);
    case "dashboard": return buildDashboardPrompt(plan);
  }
}
