/**
 * specialist-prompts.ts — Specialist prompts for the v3 build pipeline.
 *
 * Each specialist reads .openclaw/plan/architecture.json from the workspace
 * and writes code files for its domain. The architect agent has shell access
 * and writes files via `mkdir -p && cat > file << 'EOF'`.
 */

import type { ArchitecturePlan } from "./scaffoldTemplates";

export type SpecialistType = "scaffold" | "identity" | "database" | "backend" | "skills" | "dashboard" | "verify";

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
  // Dashboard is no longer a specialist — the scaffold generates the complete
  // working dashboard from templates. No LLM needed for dashboard code.

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
  const tableList = tables.map((t) => `- ${t.name}`).join("\n");

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

## Self-Validation — Run after writing all files

After writing the migration and seed, actually run them to verify they work:
\`\`\`bash
# Create the .env file so DATABASE_URL is available
cat > ~/.openclaw/workspace/.env << 'ENDENV'
DATABASE_URL=postgresql://agent:agent@localhost:5432/agent
ENDENV

# Create the database and user if they don't exist
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='agent'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER agent WITH PASSWORD 'agent';"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='agent'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE agent OWNER agent;"

# Run the migration
cd ~/.openclaw/workspace && DATABASE_URL=postgresql://agent:agent@localhost:5432/agent npx tsx db/migrate.ts

# Run the seed
cd ~/.openclaw/workspace && DATABASE_URL=postgresql://agent:agent@localhost:5432/agent npx tsx db/seed.ts
\`\`\`

If migration or seed fails, fix the SQL/TypeScript and re-run. Only confirm after both succeed.

After writing and validating all files, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "database", "files": ["db/migrations/001_initial.sql", "db/types.ts", "db/seed.ts", "db/migrate.ts"]}
\`\`\`
`;
}

// ─── Backend Specialist ──────────────────────────────────────────────────────

export function buildBackendPrompt(plan: ArchitecturePlan): string {
  const endpoints = plan.apiEndpoints ?? [];
  const endpointList = endpoints.map((e) => `- ${e.method} ${e.path}: ${e.description}`).join("\n");

  const hasDb = Boolean(plan.dataSchema?.tables?.length);

  return `[SPECIALIST: Backend Engineer]

You are writing the backend API layer. Read the architecture plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

${hasDb ? "Also read the database types and migration:\n```bash\ncat ~/.openclaw/workspace/db/types.ts\ncat ~/.openclaw/workspace/db/migrations/001_initial.sql\n```\n" : ""}

The plan specifies these endpoints:
${endpointList}

IMPORTANT: **backend/index.ts already exists** — the scaffold generated it with Express 4, CORS, health check, route imports, dashboard static file serving, and SPA fallback. DO NOT overwrite it. Only generate the route, service, and middleware files.

Write these files:

1. **backend/routes/*.ts** — One file per resource group (e.g., campaigns.ts, reports.ts). Each exports an Express Router. The route file name must match what backend/index.ts imports.

2. **backend/services/*.ts** — Business logic functions called by routes. Each service file handles one domain.
${hasDb ? `
3. **backend/services/db.ts** — A shared database client module that connects to PostgreSQL using DATABASE_URL from the environment. Export a \`query(text, params)\` helper. Use the \`pg\` package (already in package.json).

CRITICAL: The plan has a PostgreSQL database schema. Your services MUST query PostgreSQL using the db.ts client — do NOT use file-based JSON storage, in-memory stores, or SQLite. The database specialist already wrote migrations and seed data for PostgreSQL.
` : ""}
4. **backend/middleware/auth.ts** — Simple auth middleware (check Bearer token or API key from env).

Use TypeScript, Express 4, async/await.${hasDb ? " Import types from db/types.ts and use the db client for all data access." : ""}
Keep routes thin — delegate logic to services.
Return proper HTTP status codes and JSON error responses.

## Self-Validation

After writing all files, verify your work:
\`\`\`bash
# Check that all route files exist and are non-empty
ls -la ~/.openclaw/workspace/backend/routes/
ls -la ~/.openclaw/workspace/backend/services/
${hasDb ? "# Verify db.ts uses pg, not file I/O\ngrep -l 'Pool\\|Client' ~/.openclaw/workspace/backend/services/db.ts" : ""}
\`\`\`

Write each file:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/backend/routes ~/.openclaw/workspace/backend/services ~/.openclaw/workspace/backend/middleware
cat > ~/.openclaw/workspace/backend/routes/[resource].ts << 'ENDTS'
[content]
ENDTS
\`\`\`

After writing all files, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "backend", "files": ["backend/routes/...", "backend/services/...", "backend/middleware/auth.ts"]}
\`\`\`
`;
}

// ─── Skill Specialist (OpenClaw SKILL.md format) ────────────────────────────

export function buildSkillHandlerPrompt(plan: ArchitecturePlan): string {
  const skillList = plan.skills.map((s) => {
    const env = s.envVars.length ? s.envVars.join(", ") : "none";
    return `- ${s.id}: ${s.description} (env: ${env})`;
  }).join("\n");

  return `[SPECIALIST: Skill Builder — OpenClaw SKILL.md format]

You are writing OpenClaw skills as **SKILL.md** files. These are markdown files that the agent LLM reads and follows as instructions. The agent is an LLM — it reads the SKILL.md to understand what to do, then uses its tools (bash, file I/O, API calls) to execute the skill.

Read the plan:
\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/plan/architecture.json
\`\`\`

Skills to implement:
${skillList}

## SKILL.md Format

For EACH skill, write ONE file: **skills/<skill-id>/SKILL.md**

Each SKILL.md must have:

### 1. YAML Frontmatter
\`\`\`yaml
---
name: <skill-id>
version: 1.0.0
description: "<one-line description>"
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [bash, curl, jq]
      env: [ENV_VAR_1, ENV_VAR_2]
    primaryEnv: <main env var>
---
\`\`\`

### 2. Markdown Content — a clear, step-by-step guide the agent follows

Structure each skill with these sections:
- **Purpose**: What this skill does and when to use it
- **Input**: What the agent receives (user message, parameters, context)
- **Process**: Step-by-step instructions with inline bash/curl commands the agent executes
- **Output**: What the agent returns to the user
- **Error Handling**: How to handle failures gracefully

### Key Rules
- Skills are documentation for the agent LLM, NOT executable code
- Include inline \`bash\` or \`curl\` commands the agent can copy and run via its shell tool
- Reference environment variables from the plan: \`\${APOLLO_API_KEY}\`, \`\${SENDGRID_API_KEY}\`, etc.
- Each skill should be self-contained — the agent reads ONE file and knows everything
- Use clear markdown formatting — headers, lists, code blocks
- Include realistic example API calls with actual endpoint paths, headers, and JSON payloads
- Keep skills focused — one skill does one thing well

## Example SKILL.md

\`\`\`markdown
---
name: search-leads
version: 1.0.0
description: "Search for leads matching an ICP using Apollo API"
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl, jq]
      env: [APOLLO_API_KEY]
    primaryEnv: APOLLO_API_KEY
---

# Search Leads

## Purpose
Find prospective leads that match the user's Ideal Customer Profile using the Apollo people search API.

## Input
The user provides targeting criteria: job titles, industries, company sizes, geographies.

## Process

1. Parse the user's targeting criteria into Apollo search filters
2. Call the Apollo people search API:
\\\`\\\`\\\`bash
curl -s -X POST "https://api.apollo.io/api/v1/mixed_people/search" \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: \${APOLLO_API_KEY}" \\
  -d '{
    "person_titles": ["VP Sales", "Director of Marketing"],
    "organization_num_employees_ranges": ["51,200"],
    "person_locations": ["United States"],
    "per_page": 25
  }'
\\\`\\\`\\\`
3. Parse the response and extract: name, title, company, email, LinkedIn URL
4. Format results as a table for the user

## Output
Return a formatted list of leads with contact details, or a clear message if no matches found.

## Error Handling
- If API returns 401: tell the user their Apollo API key may be invalid
- If API returns 429: wait and retry, tell the user about rate limits
- If no results: suggest broadening the search criteria
\`\`\`

## Writing Skills

Write each skill:
\`\`\`bash
mkdir -p ~/.openclaw/workspace/skills/<skill-id>
cat > ~/.openclaw/workspace/skills/<skill-id>/SKILL.md << 'ENDSKILL'
[SKILL.md content with frontmatter + markdown]
ENDSKILL
\`\`\`

After writing ALL skills, confirm:
\`\`\`json
{"type": "specialist_done", "specialist": "skills", "files": ["skills/<id>/SKILL.md", ...]}
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
    case "verify": return buildVerificationPrompt();
  }
}

// ─── Verification Specialist ──────────────────────────────────────────────────

function buildVerificationPrompt(): string {
  return `[VERIFICATION SPECIALIST]

You are verifying and repairing the agent workspace after the build phase completed.
Your job is to make sure everything compiles, builds, starts, and responds correctly.

## Step 1: Read the verification plan

\`\`\`bash
cat ~/.openclaw/workspace/.openclaw/build/verification-plan.json
\`\`\`

This file contains a list of checks. Each check has:
- \`id\`: unique name
- \`command\`: shell command to run
- \`successCondition\`: what success looks like
- \`maxAttempts\`: how many times to try fixing before giving up
- \`setup\` (optional): a command to run before the check (e.g., start a service)

## Step 2: Execute each check in order

For EACH check in the plan:

1. If the check has a \`setup\` command, run it first and wait 3 seconds
2. Run the \`command\` in your terminal
3. If it succeeds (exit code 0 and output looks correct) → record status "pass", move on
4. If it fails:
   a. Read the error output carefully
   b. Identify which file is causing the problem
   c. Read that file: \`cat ~/.openclaw/workspace/<path>\`
   d. Fix the file by rewriting it: \`cat > ~/.openclaw/workspace/<path> << 'ENDFIX'\` ... \`ENDFIX\`
   e. Re-run the check command to verify your fix worked
   f. Repeat up to \`maxAttempts\` times
   g. If still failing after max attempts, record status "fail" with the last error and move on

## Step 3: Write the verification report

After processing ALL checks, write the report:

\`\`\`bash
cat > ~/.openclaw/workspace/.openclaw/build/verification-report.json << 'ENDREPORT'
{
  "timestamp": "<current ISO timestamp>",
  "checks": [
    { "id": "<check-id>", "status": "pass", "attempts": 1 },
    { "id": "<check-id>", "status": "pass", "attempts": 2, "fixApplied": "<what you fixed>" },
    { "id": "<check-id>", "status": "fail", "attempts": 3, "lastError": "<final error>", "fixAttempted": "<what you tried>" }
  ],
  "summary": { "total": <N>, "pass": <N>, "fail": <N> }
}
ENDREPORT
\`\`\`

## Critical Rules

- Fix the ACTUAL source code, not the tests. If npm install fails, fix package.json. If TypeScript fails, fix the .ts file.
- NEVER add \`// @ts-ignore\`, \`any\` casts, or \`as unknown\` to silence errors. Fix the real type issue.
- If a service crashes on startup, read \`/tmp/agent-<name>.log\` to find the crash reason, then fix the entry point.
- If an API endpoint returns an error, read the route handler file and fix the logic.
- After EVERY fix, re-run the check command to confirm the fix actually worked before recording "pass".
- For service checks: kill any existing process on the port first, start the service, wait 3 seconds, then check.
- ALWAYS write verification-report.json at the end, even if some checks fail.
- Process checks in the order they appear in the plan. Dependencies matter (deps before compile, compile before services).

## Skill Verification

Skills must be OpenClaw SKILL.md files, NOT TypeScript handlers. For EACH skill directory:
\`\`\`bash
ls ~/.openclaw/workspace/skills/*/SKILL.md
\`\`\`
Every skill MUST have a SKILL.md file with YAML frontmatter (---name, version, description---).
If a skill has handler.ts but no SKILL.md, that is a FAILURE — the skill was built in the wrong format.

## Database & Backend Consistency

If the plan has a database schema (db/migrations/ exists):
1. Verify .env file exists with DATABASE_URL
2. Verify the database was migrated: \`psql $DATABASE_URL -c "\\dt"\` should show tables
3. Verify backend services use PostgreSQL (pg Pool/Client), NOT file-based JSON:
   \`\`\`bash
   grep -rl "readFile\\|writeFile\\|store.json\\|fs.read\\|fs.write" ~/.openclaw/workspace/backend/services/ && echo "FAIL: backend uses file storage instead of PostgreSQL" || echo "PASS: no file storage found"
   grep -rl "Pool\\|Client\\|pg" ~/.openclaw/workspace/backend/services/ && echo "PASS: backend uses PostgreSQL" || echo "FAIL: backend missing PostgreSQL client"
   \`\`\`
4. If the backend uses file storage instead of PostgreSQL, rewrite the services to use the pg client.
5. Verify seed data exists: \`psql $DATABASE_URL -c "SELECT count(*) FROM <first_table>"\`

## Dashboard-Backend Integration

The dashboard and backend MUST be served from the same Express app on one port (3100).
The backend entry point (backend/index.ts) MUST:
1. Use express version 4 (not v5) — add "express": "^4.21.0" to package.json
2. Add cors middleware: import cors from cors then app.use(cors())
3. Serve dashboard static files: app.use(express.static(path.join(process.cwd(), 'dashboard/dist')))
4. Add SPA fallback AFTER API routes but BEFORE the error handler using app.get with a wildcard that serves dashboard/dist/index.html
5. Dashboard hooks should use relative API paths like /api/..., never absolute URLs with a port number

This ensures:
- The dashboard and API share one origin (no CORS issues)
- Only one port needs to be exposed (3100)
- SPA routing works (all paths serve index.html)

## Dashboard Page Fixes

When dashboard route or page quality checks fail:
- Each page component MUST have loading state (\`if (!data) return <Loading />\`) and error handling (\`try/catch\` around fetch, or \`.catch()\`)
- The API base URL must use relative paths (\`/api/...\`) or \`http://localhost:3100\` — never a remote URL
- Verify \`react-router-dom\` is installed and the router wraps all pages
- If a page crashes on render, read the page file, check what data it expects from the API, then ensure the API returns that shape
- If the dashboard uses hooks to fetch data, verify the hook files exist and export correctly
- If a page shows a blank screen, add error boundaries around data-dependent components

## Completion

When done, output this JSON marker:
\`\`\`json
{"type": "specialist_done", "specialist": "verify", "files": ["verification-report.json"]}
\`\`\``;
}
