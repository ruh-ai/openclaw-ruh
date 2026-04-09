/**
 * agentValidation.ts — Deep post-build validation for agent sandboxes.
 *
 * Runs integration checks inside the container via docker exec:
 * 1. Database schema validation (tables + columns exist)
 * 2. Backend API endpoint validation (200 + valid JSON)
 * 3. Contract validation (API response keys match dashboard hook expectations)
 * 4. Dashboard build validation (dist exists + serves HTML)
 * 5. Integration validation (backend reachable, end-to-end)
 *
 * Returns a structured report with pass/fail per check and fixContext
 * that the auto-fix harness can send to the architect.
 */

import { dockerExec, getContainerName } from './docker';

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckType = "db_schema" | "api_endpoint" | "contract" | "dashboard_build" | "integration";

interface ValidationCheck {
  check: CheckType;
  status: "pass" | "fail" | "skip";
  label: string;
  detail?: string;
  fixContext?: string;
  endpoint?: string;
}

interface ValidationReport {
  timestamp: string;
  checks: ValidationCheck[];
  overallStatus: "pass" | "fail";
  passCount: number;
  failCount: number;
}

interface PlanEndpoint {
  method: string;
  path: string;
  description?: string;
}

interface PlanTable {
  name: string;
  columns?: Array<{ name: string; type?: string }>;
}

interface Plan {
  apiEndpoints?: PlanEndpoint[];
  dataSchema?: { tables?: PlanTable[] };
  dashboardPages?: Array<{ path: string; title: string }>;
}

type LogFn = (msg: string) => void;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function exec(containerName: string, cmd: string, timeoutMs = 10_000): Promise<{ ok: boolean; output: string }> {
  const [ok, output] = await dockerExec(containerName, cmd, timeoutMs);
  return { ok, output: output.trim() };
}

/** Extract field names that a dashboard hook accesses from its TypeScript source. */
function extractHookFields(source: string): string[] {
  const fields = new Set<string>();

  // Pattern: data.fieldName or item.fieldName (but not single-letter vars like d.metrics which are internal transforms)
  for (const m of source.matchAll(/(?:data|item|row|record|entry)\.([\w]+)/g)) {
    fields.add(m[1]);
  }
  // Pattern: const { field1, field2 } = data
  for (const m of source.matchAll(/\{([^}]+)\}\s*=\s*(?:data|response|result|json)\b/g)) {
    for (const part of m[1].split(',')) {
      const clean = part.trim().split(':')[0].trim();
      if (clean && /^[a-zA-Z_]\w*$/.test(clean)) fields.add(clean);
    }
  }

  const IGNORE = new Set([
    'length', 'map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every',
    'includes', 'indexOf', 'slice', 'join', 'keys', 'values', 'entries',
    'toString', 'trim', 'replace', 'split', 'toFixed', 'toLocaleString',
    'then', 'catch', 'finally', 'signal', 'aborted', 'ok',
    // Common hook/React patterns that aren't API response fields
    'data', 'loading', 'error', 'setData', 'setLoading', 'setError',
    'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
    'current', 'call', 'apply', 'bind', 'prototype', 'constructor',
  ]);
  return [...fields].filter(f => !IGNORE.has(f));
}

/** Find dashboard hook file that matches an API endpoint path. */
async function findHookForEndpoint(containerName: string, endpointPath: string): Promise<string | null> {
  const { ok, output } = await exec(containerName,
    `ls $HOME/.openclaw/workspace/dashboard/hooks/ 2>/dev/null`);
  if (!ok || !output) return null;

  const pathParts = endpointPath.replace(/^\/api\//, '').split('/');
  const keyword = pathParts[pathParts.length - 1]?.toLowerCase().slice(0, 7) ?? '';

  for (const file of output.split('\n')) {
    if (file.toLowerCase().includes(keyword) && file.endsWith('.ts')) {
      return `dashboard/hooks/${file}`;
    }
  }
  return null;
}

// ─── Validation Checks ───────────────────────────────────────────────────────

async function checkDatabase(containerName: string, tables: PlanTable[], log: LogFn): Promise<ValidationCheck[]> {
  if (tables.length === 0) return [];
  const checks: ValidationCheck[] = [];

  const { output: dbFiles } = await exec(containerName,
    `find $HOME/.openclaw/workspace/db -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" 2>/dev/null | head -3`);

  if (!dbFiles) {
    const { ok: pgOk } = await exec(containerName, `psql -U openclaw -d openclaw -c "SELECT 1" 2>/dev/null`);
    if (!pgOk) {
      checks.push({ check: "db_schema", status: "skip", label: "Database check skipped — no database files found" });
      return checks;
    }
  }

  for (const table of tables) {
    log(`Checking table: ${table.name}`);
    const dbFile = dbFiles?.split('\n')[0];
    const schemaCmd = dbFile
      ? `sqlite3 ${dbFile} ".schema ${table.name}" 2>/dev/null`
      : `psql -U openclaw -d openclaw -c "\\d ${table.name}" -t 2>/dev/null`;
    const { ok, output } = await exec(containerName, schemaCmd);

    if (!ok || !output || output.includes('no such table') || output.includes('Did not find')) {
      checks.push({
        check: "db_schema", status: "fail",
        label: `Table "${table.name}" does not exist`,
        detail: `Expected table "${table.name}" from the architecture plan but it was not found in the database.`,
        fixContext: `[FIX: Missing Database Table]\n\nThe table "${table.name}" is defined in the architecture plan but does not exist in the database.\n\nCheck the migration file and ensure it creates this table:\n\`\`\`bash\ncat ~/.openclaw/workspace/db/migrations/*.sql\n\`\`\`\n\nFix the migration, then run it:\n\`\`\`bash\ncd ~/.openclaw/workspace && npm run db:migrate\n\`\`\``,
      });
    } else {
      checks.push({ check: "db_schema", status: "pass", label: `Table "${table.name}" exists` });
    }
  }
  return checks;
}

async function checkApiEndpoints(containerName: string, endpoints: PlanEndpoint[], log: LogFn): Promise<{ checks: ValidationCheck[]; responses: Map<string, Record<string, unknown>> }> {
  const checks: ValidationCheck[] = [];
  const responses = new Map<string, Record<string, unknown>>();

  for (const ep of endpoints) {
    if (ep.method.toUpperCase() !== 'GET') continue;
    log(`Checking endpoint: ${ep.method} ${ep.path}`);
    const { ok, output } = await exec(containerName, `curl -sf --max-time 5 http://localhost:3100${ep.path} 2>/dev/null`);

    if (!ok || !output) {
      checks.push({
        check: "api_endpoint", status: "fail", label: `${ep.method} ${ep.path} — not responding`, endpoint: ep.path,
        detail: `Endpoint returned non-200 or no response.`,
        fixContext: `[FIX: API Endpoint Not Working]\n\nThe endpoint ${ep.method} ${ep.path} is not responding.\n\nCheck the route file:\n\`\`\`bash\nls ~/.openclaw/workspace/backend/routes/\ncat ~/.openclaw/workspace/backend/index.ts\n\`\`\`\n\nFix any errors, then verify:\n\`\`\`bash\ncurl -sf http://localhost:3100${ep.path}\n\`\`\``,
      });
      continue;
    }

    try {
      const parsed = JSON.parse(output);
      responses.set(ep.path, parsed);
      checks.push({ check: "api_endpoint", status: "pass", label: `${ep.method} ${ep.path} — 200 OK`, endpoint: ep.path });
    } catch {
      checks.push({
        check: "api_endpoint", status: "fail", label: `${ep.method} ${ep.path} — invalid JSON`, endpoint: ep.path,
        detail: `Endpoint returned non-JSON response: ${output.slice(0, 100)}`,
        fixContext: `[FIX: API Returns Invalid JSON]\n\nThe endpoint ${ep.method} ${ep.path} returns invalid JSON.\n\nResponse (first 200 chars): ${output.slice(0, 200)}\n\nCheck and fix the route handler.`,
      });
    }
  }
  return { checks, responses };
}

async function checkContracts(containerName: string, endpoints: PlanEndpoint[], apiResponses: Map<string, Record<string, unknown>>, log: LogFn): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  for (const ep of endpoints) {
    if (ep.method.toUpperCase() !== 'GET') continue;
    const response = apiResponses.get(ep.path);
    if (!response) continue;

    const hookPath = await findHookForEndpoint(containerName, ep.path);
    if (!hookPath) continue;

    log(`Checking contract: ${ep.path} ↔ ${hookPath}`);
    const { ok, output: hookSource } = await exec(containerName, `cat $HOME/.openclaw/workspace/${hookPath} 2>/dev/null`);
    if (!ok || !hookSource) continue;

    const hookFields = extractHookFields(hookSource);
    if (hookFields.length === 0) continue;

    const responseKeys = new Set<string>();
    function collectKeys(obj: unknown) {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const key of Object.keys(obj as Record<string, unknown>)) responseKeys.add(key);
      }
    }
    collectKeys(response);
    for (const val of Object.values(response)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) collectKeys(val);
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') collectKeys(val[0]);
    }

    const missingInBackend = hookFields.filter(f => !responseKeys.has(f));
    if (missingInBackend.length > 0) {
      const actualKeys = [...responseKeys].sort().join(', ');
      checks.push({
        check: "contract", status: "fail",
        label: `Contract mismatch: ${ep.path} ↔ ${hookPath}`, endpoint: ep.path,
        detail: `Dashboard expects fields [${missingInBackend.join(', ')}] but backend doesn't return them. Backend returns: [${actualKeys}]`,
        fixContext: `[FIX: API Contract Mismatch]\n\nThe dashboard hook at ${hookPath} expects these fields that the backend doesn't return:\nMissing: ${missingInBackend.join(', ')}\n\nBackend ${ep.method} ${ep.path} actually returns these keys:\n${actualKeys}\n\nRead both files:\n\`\`\`bash\ncat ~/.openclaw/workspace/${hookPath}\ncat ~/.openclaw/workspace/backend/routes/*.ts | head -200\n\`\`\`\n\nFix the BACKEND route to return fields matching what the dashboard hook expects.\nAfter fixing, restart the backend:\n\`\`\`bash\npkill -f "tsx backend/index.ts" 2>/dev/null; sleep 1\ncd ~/.openclaw/workspace && nohup PORT=3100 npx tsx backend/index.ts > /tmp/backend.log 2>&1 &\n\`\`\``,
      });
    } else {
      checks.push({ check: "contract", status: "pass", label: `Contract OK: ${ep.path} ↔ ${hookPath}`, endpoint: ep.path });
    }
  }
  return checks;
}

async function checkDashboard(containerName: string, log: LogFn): Promise<ValidationCheck[]> {
  log("Checking dashboard build...");
  const { ok: distExists } = await exec(containerName, `test -f $HOME/.openclaw/workspace/dashboard/dist/index.html && echo OK`);
  if (!distExists) {
    return [{ check: "dashboard_build", status: "fail", label: "Dashboard dist/index.html missing — build may have failed",
      fixContext: `[FIX: Dashboard Build Failed]\n\nRebuild it:\n\`\`\`bash\ncd ~/.openclaw/workspace/dashboard && npx vite build --outDir dist 2>&1\n\`\`\`` }];
  }
  const { ok: serves } = await exec(containerName, `curl -sf --max-time 3 http://localhost:3200/ | head -c 50`);
  if (!serves) {
    return [{ check: "dashboard_build", status: "fail", label: "Dashboard built but not serving on port 3200",
      fixContext: `[FIX: Dashboard Not Serving]\n\nStart it:\n\`\`\`bash\ncd ~/.openclaw/workspace && nohup npx serve dashboard/dist -l 3200 -s --no-clipboard > /tmp/dashboard-serve.log 2>&1 &\n\`\`\`` }];
  }
  return [{ check: "dashboard_build", status: "pass", label: "Dashboard built and serving on port 3200" }];
}

async function checkIntegration(containerName: string, firstEndpoint: string | null, log: LogFn): Promise<ValidationCheck[]> {
  log("Checking end-to-end integration...");
  if (!firstEndpoint) return [{ check: "integration", status: "skip", label: "Integration check skipped — no endpoints to test" }];
  const { ok } = await exec(containerName, `curl -sf --max-time 5 http://localhost:3100${firstEndpoint} > /dev/null 2>&1 && echo OK`);
  if (!ok) {
    return [{ check: "integration", status: "fail", label: "Backend not reachable from inside container",
      fixContext: `[FIX: Backend Not Running]\n\nRestart it:\n\`\`\`bash\npkill -f "tsx backend/index.ts" 2>/dev/null; sleep 1\ncd ~/.openclaw/workspace && nohup PORT=3100 npx tsx backend/index.ts > /tmp/backend.log 2>&1 &\nsleep 3 && curl -sf http://localhost:3100/health\n\`\`\`` }];
  }
  return [{ check: "integration", status: "pass", label: "End-to-end: backend reachable, dashboard serving" }];
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runDeepValidation(sandboxId: string, plan: Plan, log: LogFn = () => {}): Promise<ValidationReport> {
  const containerName = getContainerName(sandboxId);
  const allChecks: ValidationCheck[] = [];

  const tables = plan.dataSchema?.tables ?? [];
  if (tables.length > 0) allChecks.push(...await checkDatabase(containerName, tables, log));

  const endpoints = (plan.apiEndpoints ?? []).filter(ep => ep.method?.toUpperCase() === 'GET');
  const { checks: apiChecks, responses } = await checkApiEndpoints(containerName, endpoints, log);
  allChecks.push(...apiChecks);

  if (endpoints.length > 0) allChecks.push(...await checkContracts(containerName, endpoints, responses, log));

  allChecks.push(...await checkDashboard(containerName, log));
  allChecks.push(...await checkIntegration(containerName, endpoints[0]?.path ?? null, log));

  const passCount = allChecks.filter(c => c.status === "pass").length;
  const failCount = allChecks.filter(c => c.status === "fail").length;

  return { timestamp: new Date().toISOString(), checks: allChecks, overallStatus: failCount > 0 ? "fail" : "pass", passCount, failCount };
}
