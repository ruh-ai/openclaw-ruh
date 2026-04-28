/**
 * agentBuild.ts — Server-side build pipeline for agent creation.
 *
 * @kb: 008-agent-builder-ui 005-data-models
 *
 * Runs entirely on the backend: scaffold → specialists → validation → setup.
 * No browser dependency. Direct docker exec for file writes. Direct gateway
 * HTTP for specialist calls. Yields progress events as an async generator
 * consumed by the SSE endpoint.
 *
 * Supports parallel specialist execution, skill chunking, cancellation,
 * real-time setup events, and resilient manifest persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import { generateScaffoldFiles, normalizePlan, staleScaffoldFilesForPlan, type ArchitecturePlan } from './scaffoldTemplates';
import { getSpecialistPrompt, getRequiredSpecialists, type SpecialistType, type TargetAgent } from './specialistPrompts';
import { mergeWorkspaceCopilotToMain, writeWorkspaceFile, writeWorkspaceFiles } from './workspaceWriter';
import { buildHomeFileWriteCommand, dockerExec, getContainerName, shellQuote } from './docker';
import { gatewayUrlAndHeaders } from './utils';
import * as store from './store';
import { summarizeBuildReport, type BuildReport } from './buildReport';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildEvent {
  type: "task_start" | "task_complete" | "task_failed" | "file_written"
    | "progress" | "status" | "build_complete" | "error"
    | "setup_progress" | "build_report";
  specialist?: string;
  files?: string[];
  error?: string;
  path?: string;
  completed?: number;
  total?: number;
  message?: string;
  manifest?: BuildManifest;
  report?: BuildReport;
  setupPhase?: string;
}

interface BuildManifestTask {
  id: string;
  specialist: string;
  status: "pending" | "running" | "done" | "failed";
  files: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  /**
   * Path B Slice 3: when this task is a per-agent specialist run (identity
   * or skills in a fleet pipeline), the agent it targets. Absent for
   * pipeline-level specialists (database, backend, dashboard, verify) and
   * for single-agent pipelines.
   */
  targetAgentId?: string;
}

interface BuildManifest {
  version: 3;
  agentName: string;
  createdAt: string;
  plan: string;
  tasks: BuildManifestTask[];
  completedAt?: string;
}

export interface BuildOptions {
  parallelBuild?: boolean;
  signal?: AbortSignal;
}

interface VerificationCheck {
  id: string;
  command: string;
  successCondition: string;
  maxAttempts: number;
  setup?: string;
}

interface VerificationPlan {
  generatedAt: string;
  agentName: string;
  checks: VerificationCheck[];
}

// ─── Verification plan generator ───────────────────────────────────────────
// Ported from agent-builder-ui/lib/openclaw/build-harness.ts so the server-side
// pipeline writes a verification-plan.json before invoking the verify
// specialist. Without this, the verify specialist reports a spurious
// "verification-plan was not present" fail even when every real check passes.

const WS = '$HOME/.openclaw/workspace';

function generateVerificationPlan(plan: ArchitecturePlan, agentName: string): VerificationPlan {
  const checks: VerificationCheck[] = [];

  checks.push({
    id: 'deps',
    command: `cd ${WS} && npm install 2>&1`,
    successCondition: 'exitCode === 0',
    maxAttempts: 3,
  });

  checks.push({
    id: 'compile',
    command: `cd ${WS} && npx tsc --noEmit 2>&1`,
    successCondition: 'exitCode === 0',
    maxAttempts: 5,
  });

  if (plan.dashboardPages?.length) {
    checks.push({
      id: 'dashboard_build',
      command: `cd ${WS}/dashboard && npx vite build --outDir dist 2>&1`,
      successCondition: 'exitCode === 0 and dashboard/dist/index.html exists',
      maxAttempts: 3,
    });
  }

  if (plan.dataSchema?.tables?.length) {
    const tableNames = plan.dataSchema.tables.map((t) => t.name).join(', ');
    checks.push({
      id: 'database',
      command: `cd ${WS} && npm run db:migrate 2>&1`,
      successCondition: `exitCode === 0 and tables exist: ${tableNames}`,
      maxAttempts: 3,
    });
  }

  if (plan.apiEndpoints?.length) {
    checks.push({
      id: 'service_backend',
      command: `sleep 3 && curl -sf http://localhost:3100/health 2>&1`,
      successCondition: 'HTTP 200 response',
      maxAttempts: 3,
      setup: [
        `cd ${WS}`,
        `if [ -f ${WS}/.openclaw/.env ]; then set -a; . ${WS}/.openclaw/.env 2>/dev/null; set +a; fi`,
        `kill $(cat /tmp/agent-backend.pid 2>/dev/null) 2>/dev/null; fuser -k 3100/tcp 2>/dev/null; sleep 1`,
        `PORT=3100 nohup npx tsx backend/index.ts > /tmp/agent-backend.log 2>&1 & echo $! > /tmp/agent-backend.pid`,
      ].join(' && '),
    });
  }

  if (plan.dashboardPages?.length) {
    checks.push({
      id: 'service_dashboard',
      command: `curl -sf http://localhost:3200/ 2>&1`,
      successCondition: 'HTTP 200 response',
      maxAttempts: 2,
      setup: [
        `kill $(cat /tmp/agent-dashboard.pid 2>/dev/null) 2>/dev/null; fuser -k 3200/tcp 2>/dev/null; sleep 1`,
        `cd ${WS} && nohup npx serve dashboard/dist -l 3200 -s --no-clipboard > /tmp/agent-dashboard.log 2>&1 & echo $! > /tmp/agent-dashboard.pid`,
        `sleep 2`,
      ].join(' && '),
    });
  }

  const getEndpoints = plan.apiEndpoints?.filter((e) => e.method === 'GET') ?? [];
  for (const ep of getEndpoints) {
    const testPath = ep.path.split('?')[0].replace(/:[a-zA-Z]+/g, 'test');
    checks.push({
      id: `endpoint_${ep.method}_${ep.path}`,
      command: `curl -sf --max-time 5 http://localhost:3100${testPath} 2>&1`,
      successCondition: 'valid JSON response',
      maxAttempts: 3,
    });
  }

  return { generatedAt: new Date().toISOString(), agentName, checks };
}

async function writeVerificationPlan(
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
): Promise<VerificationPlan> {
  const verificationPlan = generateVerificationPlan(plan, agentName);
  const content = JSON.stringify(verificationPlan, null, 2);
  const containerName = getContainerName(sandboxId);

  await dockerExec(
    containerName,
    `mkdir -p $HOME/.openclaw/workspace/.openclaw/build && cat > $HOME/.openclaw/workspace/.openclaw/build/verification-plan.json << 'ENDPLAN'\n${content}\nENDPLAN`,
    10_000,
  );

  return verificationPlan;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function isMeaningfulSpecialistSsePayload(data: string): boolean {
  const trimmed = data.trim();
  if (!trimmed) return false;
  if (trimmed === '[DONE]') return true;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.error || parsed.type === 'error') return true;
    if (typeof parsed.choices?.[0]?.delta?.content === 'string' && parsed.choices[0].delta.content.length > 0) {
      return true;
    }
    if (parsed.type === 'file_written' || parsed.event === 'file_written') return true;
    if (parsed.type === 'specialist_done' || parsed.specialist_done) return true;
  } catch {
    return false;
  }

  return false;
}

/** Simple async iterable queue for bridging callbacks to async generators. */
function createAsyncQueue<T>() {
  const buffer: T[] = [];
  let resolve: ((v: IteratorResult<T>) => void) | null = null;
  let done = false;
  return {
    push(item: T) {
      if (resolve) { resolve({ value: item, done: false }); resolve = null; }
      else buffer.push(item);
    },
    end() {
      done = true;
      if (resolve) resolve({ value: undefined as unknown as T, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
          if (done) return Promise.resolve({ value: undefined as unknown as T, done: true });
          return new Promise((r) => { resolve = r; });
        },
      };
    },
  };
}

// ─── Specialist dependencies for parallel execution ────────────────────────
// The gateway processes requests on a single lane, so we limit concurrency
// to avoid queue contention. Skills is heavy (chunked calls) and must run
// alone to get the full lane. Identity + database are lightweight and safe
// to parallelize. Backend depends on database for types.ts.

const SPECIALIST_DEPS: Record<string, string[]> = {
  identity: [],
  database: [],
  skills: ['identity', 'database'], // run after lightweight specialists to avoid gateway queue contention
  backend: ['database', 'skills'], // needs db/types.ts; runs after skills to avoid gateway lane competition
  dashboard: [],
};

// ─── Specialist execution (server-side gateway call) ────────────────────────

async function callSpecialist(
  sandboxId: string,
  prompt: string,
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<{ content: string; files: string[] }> {
  const record = await store.getSandbox(sandboxId);
  if (!record) throw new Error('Sandbox not found');
  const [url, headers] = gatewayUrlAndHeaders(record, '/v1/chat/completions');
  headers['Content-Type'] = 'application/json';

  const body = JSON.stringify({
    messages: [{ role: 'user', content: prompt }],
    model: 'openclaw',
    stream: true,
  });

  onStatus?.('Connecting to architect...');

  // Combine user-provided cancellation signal with a 10-minute timeout.
  const timeoutSignal = AbortSignal.timeout(10 * 60 * 1000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: combinedSignal,
  });
  if (!resp.ok) throw new Error(`Gateway returned ${resp.status}`);
  if (!resp.body) throw new Error('No response body from gateway');

  // Stream the SSE response from the gateway, collect text + files.
  // The gateway may keep the SSE connection open after the specialist completes,
  // so we break on [DONE] or specialist_done rather than waiting for stream end.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const filesWritten: string[] = [];
  let streamDone = false;

  // Inactivity timeout: if no new data arrives for 2 minutes, the specialist
  // likely finished but the gateway kept the stream open. Force-close the reader.
  // 2 minutes allows for the agent's initial tool calls (reading workspace,
  // checking files) which produce no delta content before text starts flowing.
  // Also hard-cap at 10 minutes total.
  let lastMeaningfulDataAt = Date.now();
  const INACTIVITY_MS = 120_000;
  const HARD_TIMEOUT_MS = 10 * 60 * 1000;
  const startedAt = Date.now();

  const inactivityCheck = setInterval(() => {
    const now = Date.now();
    if (now - lastMeaningfulDataAt > INACTIVITY_MS || now - startedAt > HARD_TIMEOUT_MS) {
      try { reader.cancel(); } catch { /* ignore */ }
      clearInterval(inactivityCheck);
    }
  }, 5_000);

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        // [DONE] means the gateway finished — break immediately
        if (data === '[DONE]') {
          lastMeaningfulDataAt = Date.now();
          streamDone = true;
          break;
        }

        try {
          if (isMeaningfulSpecialistSsePayload(data)) {
            lastMeaningfulDataAt = Date.now();
          }

          const parsed = JSON.parse(data);
          if (parsed.error) {
            const message = typeof parsed.error?.message === 'string'
              ? parsed.error.message
              : JSON.stringify(parsed.error);
            throw new Error(message);
          }
          if (parsed.type === 'error') {
            throw new Error(String(parsed.message ?? parsed.error ?? 'Specialist stream error'));
          }
          // OpenAI-format streaming: choices[0].delta.content
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            fullText += delta;

            // The specialist_done marker appears inside the content text
            // (not as a separate SSE event). Check the accumulated text
            // after each delta for early termination.
            // Use regex to find the complete JSON object — JSON.parse fails
            // on trailing content when slicing from fullText.
            const doneMatch = fullText.match(/\{[^{}]*"specialist_done"[^{}]*"files"\s*:\s*\[[^\]]*\][^{}]*\}/);
            if (doneMatch) {
              try {
                const doneObj = JSON.parse(doneMatch[0]);
                const doneFiles = doneObj.files ?? [];
                if (Array.isArray(doneFiles)) {
                  for (const f of doneFiles) {
                    if (typeof f === 'string' && !filesWritten.includes(f)) filesWritten.push(f);
                  }
                }
              } catch { /* regex matched but JSON invalid — extract files from text */ }
              streamDone = true;
              break;
            }
            // Also check for simpler specialist_done without files array
            if (!doneMatch && fullText.includes('"specialist_done"') && fullText.includes('}')) {
              const simpleMatch = fullText.match(/\{[^{}]*"specialist_done"[^{}]*\}/);
              if (simpleMatch) {
                try {
                  const obj = JSON.parse(simpleMatch[0]);
                  const f = obj.files;
                  if (Array.isArray(f)) f.forEach((p: string) => { if (!filesWritten.includes(p)) filesWritten.push(p); });
                } catch { /* ignore */ }
                streamDone = true;
                break;
              }
            }
          }
          // Detect tool events (file writes from the architect's shell)
          if (parsed.type === 'file_written' || parsed.event === 'file_written') {
            const path = parsed.path ?? parsed.data?.path;
            if (path) filesWritten.push(path);
          }
          // Also check top-level SSE event structure for specialist_done
          if (parsed.type === 'specialist_done' || parsed.specialist_done) {
            const doneFiles = parsed.files ?? parsed.specialist_done?.files;
            if (Array.isArray(doneFiles)) {
              for (const f of doneFiles) {
                if (typeof f === 'string' && !filesWritten.includes(f)) filesWritten.push(f);
              }
            }
            streamDone = true;
            break;
          }
        } catch (err) {
          if (err instanceof SyntaxError) {
            // Non-JSON SSE line, skip.
            continue;
          }
          throw err;
        }
      }
    }
  } finally {
    clearInterval(inactivityCheck);
    try { reader.cancel(); } catch { /* ignore — already closed */ }
  }

  // Also extract files from specialist_done marker in response text
  const doneMatch = fullText.match(/\{[\s\S]*"specialist_done"[\s\S]*\}/);
  if (doneMatch) {
    try {
      const done = JSON.parse(doneMatch[0]);
      if (Array.isArray(done.files)) {
        for (const f of done.files) {
          if (typeof f === 'string' && !filesWritten.includes(f)) filesWritten.push(f);
        }
      }
    } catch { /* ignore */ }
  }

  return { content: fullText, files: filesWritten };
}

// ─── Manifest persistence (Fix 6: error handling) ──────────────────────────

async function persistManifest(sandboxId: string, manifest: BuildManifest): Promise<BuildEvent | null> {
  try {
    const content = JSON.stringify(manifest, null, 2);
    await writeWorkspaceFile(sandboxId, '.openclaw/plan/build-manifest.json', content);
    const containerName = getContainerName(sandboxId);
    const writeMainManifest = buildHomeFileWriteCommand(
      '.openclaw/workspace/.openclaw/plan/build-manifest.json',
      content,
    );
    const [ok, output] = await dockerExec(containerName, writeMainManifest, 10_000);
    if (!ok) throw new Error(output || 'Failed to write manifest to main workspace');
    return null;
  } catch (err) {
    const message = `Warning: manifest save failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[agentBuild] ${message}`);
    return { type: 'status', message };
  }
}

async function persistBuildReport(sandboxId: string, report: BuildReport): Promise<BuildEvent | null> {
  try {
    const content = JSON.stringify(report, null, 2);
    await writeWorkspaceFile(sandboxId, '.openclaw/build/build-report.json', content);
    const containerName = getContainerName(sandboxId);
    const writeMainReport = buildHomeFileWriteCommand(
      '.openclaw/workspace/.openclaw/build/build-report.json',
      content,
    );
    const [ok, output] = await dockerExec(containerName, writeMainReport, 10_000);
    if (!ok) throw new Error(output || 'Failed to write build report to main workspace');
    return null;
  } catch (err) {
    const message = `Warning: build report save failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[agentBuild] ${message}`);
    return { type: 'status', message };
  }
}

async function pruneStaleScaffoldFiles(sandboxId: string, plan: ArchitecturePlan): Promise<BuildEvent | null> {
  const stalePaths = staleScaffoldFilesForPlan(plan);
  if (stalePaths.length === 0) return null;

  try {
    const containerName = getContainerName(sandboxId);
    const quotedPaths = stalePaths.map(shellQuote).join(' ');
    const command = [
      'for p in',
      quotedPaths,
      '; do',
      'rm -f "$HOME/.openclaw/workspace-copilot/$p" "$HOME/.openclaw/workspace/$p"',
      '; done',
    ].join(' ');
    const [ok, output] = await dockerExec(containerName, command, 10_000);
    if (!ok) throw new Error(output || 'Failed to prune stale scaffold files');
    return null;
  } catch (err) {
    const message = `Warning: stale scaffold cleanup failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[agentBuild] ${message}`);
    return { type: 'status', message };
  }
}

// ─── Execute a single specialist (returns collected events) ────────────────

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function routeGroupsForPlan(plan: ArchitecturePlan): string[] {
  return uniqueStrings((plan.apiEndpoints ?? []).map((endpoint) => {
    const parts = endpoint.path.replace(/^\/api\//, '').split('/').filter((part) => part && !part.startsWith(':'));
    return parts[0] ?? 'main';
  }));
}

/**
 * Path B Slice 3 — when the architect emitted a multi-agent fleet
 * (`plan.subAgents.length > 0`), produce one `TargetAgent` per agent in
 * the fleet (main orchestrator + each sub-agent). Returns `null` for
 * single-agent pipelines, signalling the caller to keep the existing
 * specialist-runs-once-at-root-paths behavior.
 *
 * The main orchestrator's owned skills are everything in `plan.skills` NOT
 * claimed by any sub-agent. This mirrors how the architect's prompt
 * positions the orchestrator: it owns the routing + any general-purpose
 * skills, and delegates domain-specific work to specialist sub-agents.
 */
export function getAgentTargets(plan: ArchitecturePlan, agentName: string): TargetAgent[] | null {
  const subAgents = plan.subAgents ?? [];
  if (subAgents.length === 0) return null;
  const claimedSkills = new Set<string>(subAgents.flatMap((sa) => sa.skills ?? []));
  const mainSkills = plan.skills
    .filter((s) => !claimedSkills.has(s.id))
    .map((s) => s.id);
  return [
    {
      id: 'main',
      name: agentName,
      role: 'Pipeline orchestrator',
      skills: mainSkills,
      isOrchestrator: true,
    },
    ...subAgents.map((sa) => ({
      id: sa.id,
      name: sa.name,
      role: sa.description?.trim() || sa.name,
      skills: sa.skills ?? [],
      isOrchestrator: false,
    })),
  ];
}

export function expectedFilesForSpecialist(
  specialist: string,
  plan: ArchitecturePlan,
  target?: TargetAgent,
): string[] {
  // Path B Slice 3: per-agent specialists (identity, skills) write under
  // `agents/<id>/`. Pipeline-level specialists ignore the target. Single-
  // agent (no target) keeps the legacy root-level paths.
  const prefix = target ? `agents/${target.id}/` : '';
  switch (specialist) {
    case 'identity':
      return [`${prefix}SOUL.md`, `${prefix}AGENTS.md`, `${prefix}IDENTITY.md`];
    case 'database':
      return plan.dataSchema?.tables?.length
        ? ['db/migrations/001_initial.sql', 'db/types.ts', 'db/seed.ts', 'db/migrate.ts']
        : [];
    case 'backend':
      return routeGroupsForPlan(plan).map((group) => `backend/routes/${group}.ts`);
    case 'skills': {
      // Per-agent: filter to owned skills only; root-level: all plan skills.
      const ownedSkills = target
        ? plan.skills.filter((s) => target.skills.includes(s.id))
        : plan.skills;
      return ownedSkills.map((skill) => `${prefix}skills/${skill.id}/SKILL.md`);
    }
    default:
      return [];
  }
}

async function existingWorkspaceFiles(sandboxId: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const containerName = getContainerName(sandboxId);
  const command = [
    'for p in',
    paths.map(shellQuote).join(' '),
    '; do',
    'if [ -f "$HOME/.openclaw/workspace/$p" ]; then printf "%s\\n" "$p"; fi',
    'done',
  ].join(' ');
  const [ok, output] = await dockerExec(containerName, command, 10_000);
  if (!ok) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function reconcileSpecialistFiles(
  sandboxId: string,
  specialist: string,
  plan: ArchitecturePlan,
  reportedFiles: string[],
  target?: TargetAgent,
): Promise<{ files: string[]; missing: string[] }> {
  const expected = expectedFilesForSpecialist(specialist, plan, target);
  const existing = await existingWorkspaceFiles(sandboxId, expected);
  const files = uniqueStrings([...reportedFiles, ...existing]);
  const missing = expected.filter((path) => !existing.includes(path));
  return { files, missing };
}

interface SpecialistResult {
  events: BuildEvent[];
  files: string[];
  error?: string;
}

async function executeSpecialist(
  sandboxId: string,
  specialist: string,
  plan: ArchitecturePlan,
  agentName: string,
  task: BuildManifestTask,
  signal?: AbortSignal,
  target?: TargetAgent,
): Promise<SpecialistResult> {
  const events: BuildEvent[] = [];
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  if (target) task.targetAgentId = target.id;
  events.push({ type: 'task_start', specialist });
  events.push({ type: 'status', message: `Running ${specialist} specialist${target ? ` for ${target.id}` : ''}...` });

  // Dashboard is handled by scaffold — skip LLM call
  if (specialist === 'dashboard') {
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: [] });
    return { events, files: [] };
  }

  const prompt = getSpecialistPrompt(specialist as SpecialistType, plan, agentName, target);
  if (!prompt) {
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: [] });
    return { events, files: [] };
  }

  const preexisting = await reconcileSpecialistFiles(sandboxId, specialist, plan, [], target);
  if (preexisting.missing.length === 0 && preexisting.files.length > 0) {
    task.files = preexisting.files;
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'status', message: `${specialist}${target ? ` (${target.id})` : ''} files already exist; skipping specialist call.` });
    events.push({ type: 'task_complete', specialist, files: preexisting.files });
    return { events, files: preexisting.files };
  }

  // Fix 2: Chunk skills if > 3 to avoid single-point timeout. The chunking
  // operates on the skills owned by THIS specialist run — for fleets this
  // is the target's owned skills only; for single-agent it's all plan
  // skills (existing behavior).
  if (specialist === 'skills') {
    const ownedSkills = target
      ? plan.skills.filter((s) => target.skills.includes(s.id))
      : plan.skills;
    if (ownedSkills.length > 3) {
      return executeChunkedSkills(sandboxId, plan, agentName, task, signal, target);
    }
  }

  try {
    const result = await callSpecialist(sandboxId, prompt, undefined, signal);
    const reconciled = await reconcileSpecialistFiles(sandboxId, specialist, plan, result.files, target);
    if (reconciled.missing.length > 0) {
      throw new Error(`${specialist}${target ? ` (${target.id})` : ''} did not produce expected file(s): ${reconciled.missing.join(', ')}`);
    }
    task.files = reconciled.files;
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: reconciled.files });
    return { events, files: reconciled.files };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const reconciled = await reconcileSpecialistFiles(sandboxId, specialist, plan, [], target);
    if (reconciled.missing.length === 0 && reconciled.files.length > 0) {
      task.files = reconciled.files;
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      events.push({ type: 'status', message: `${specialist} specialist failed, but expected files already exist: ${errorMsg}` });
      events.push({ type: 'task_complete', specialist, files: reconciled.files });
      return { events, files: reconciled.files };
    }
    task.status = 'failed';
    task.error = errorMsg;
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_failed', specialist, error: errorMsg });
    return { events, files: [], error: errorMsg };
  }
}

// ─── Fix 2: Chunked skills execution ──────────────────────────────────────

async function executeChunkedSkills(
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
  task: BuildManifestTask,
  signal?: AbortSignal,
  target?: TargetAgent,
): Promise<SpecialistResult> {
  const events: BuildEvent[] = [];
  if (target) task.targetAgentId = target.id;
  const CHUNK_SIZE = 3;
  // For per-agent runs, chunk only the skills this agent owns. For
  // single-agent (no target), chunk all plan skills as before.
  const ownedSkills = target
    ? plan.skills.filter((s) => target.skills.includes(s.id))
    : plan.skills;
  const chunks = chunkArray(ownedSkills, CHUNK_SIZE);
  const allFiles: string[] = [];

  const preexisting = await reconcileSpecialistFiles(sandboxId, 'skills', plan, [], target);
  if (preexisting.missing.length === 0 && preexisting.files.length > 0) {
    task.files = preexisting.files;
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'status', message: `Skill files${target ? ` for ${target.id}` : ''} already exist; skipping skill specialist calls.` });
    events.push({ type: 'task_complete', specialist: 'skills', files: preexisting.files });
    return { events, files: preexisting.files };
  }

  events.push({ type: 'status', message: `Building ${ownedSkills.length} skills${target ? ` for ${target.id}` : ''} in ${chunks.length} chunks...` });

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException('Build cancelled', 'AbortError');

    const chunk = chunks[i];
    const skillIds = chunk.map((s) => s.id).join(', ');
    events.push({ type: 'status', message: `Skills chunk ${i + 1}/${chunks.length}${target ? ` (${target.id})` : ''}: ${skillIds}` });

    // Build a scoped plan with only the chunk's skills. The skills prompt
    // additionally filters by target.skills, so the chunk effectively
    // describes (skills_in_chunk ∩ target_owns) — but since the chunk
    // already comes from `ownedSkills`, every skill in the chunk is
    // already owned by the target.
    const scopedPlan = { ...plan, skills: chunk };
    const prompt = getSpecialistPrompt('skills' as SpecialistType, scopedPlan, agentName, target);
    if (!prompt) continue;

    try {
      const result = await callSpecialist(sandboxId, prompt, undefined, signal);
      allFiles.push(...result.files);
      for (const f of result.files) {
        events.push({ type: 'file_written', path: f });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ type: 'status', message: `Skills chunk ${i + 1} failed: ${msg}` });
      // Continue with remaining chunks — partial skill generation is better than none
    }
  }

  const reconciled = await reconcileSpecialistFiles(sandboxId, 'skills', plan, allFiles, target);
  task.files = reconciled.files;
  task.status = reconciled.missing.length === 0 ? 'done' : 'failed';
  task.completedAt = new Date().toISOString();
  if (task.status === 'done') {
    events.push({ type: 'task_complete', specialist: 'skills', files: reconciled.files });
  } else {
    task.error = reconciled.files.length > 0
      ? `Missing skill file(s): ${reconciled.missing.join(', ')}`
      : 'All skill chunks failed';
    events.push({ type: 'task_failed', specialist: 'skills', error: task.error });
  }
  return { events, files: reconciled.files, error: task.status === 'failed' ? task.error : undefined };
}

// ─── Main build pipeline (async generator) ──────────────────────────────────

export async function* runAgentBuild(
  agentId: string,
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
  options?: BuildOptions,
): AsyncGenerator<BuildEvent> {
  plan = normalizePlan(plan as unknown as Record<string, unknown>);
  const signal = options?.signal;

  // Fix 5: cancellation check helper
  function checkCancelled() {
    if (signal?.aborted) {
      throw new DOMException('Build cancelled', 'AbortError');
    }
  }

  const specialists = getRequiredSpecialists(plan);

  // Path B Slice 3: when the architect emitted a fleet, identity and skills
  // run once PER agent (main + sub-agents). Other specialists (database,
  // backend, dashboard, verify) stay pipeline-level. agentTargets is null
  // for single-agent — preserves the existing one-task-per-specialist shape.
  const agentTargets = getAgentTargets(plan, agentName);
  const isFleet = agentTargets !== null;

  // Build the per-specialist task list. Identity and skills multiply when
  // a fleet is present; everything else stays single-instance.
  type PlannedTask = { specialist: string; target?: TargetAgent };
  const plannedTasks: PlannedTask[] = [{ specialist: 'scaffold' }];
  for (const spec of specialists) {
    const isPerAgent = spec === 'identity' || spec === 'skills';
    if (isFleet && isPerAgent) {
      for (const target of agentTargets!) {
        plannedTasks.push({ specialist: spec, target });
      }
    } else {
      plannedTasks.push({ specialist: spec });
    }
  }
  plannedTasks.push({ specialist: 'verify' });

  // Stable, unique task ids — `${specialist}-${targetId-or-base}-${index}`
  // so multiple identity tasks (e.g., identity-main, identity-intake) don't
  // collide on lookup. Plain `${spec}-${Date.now()}` would have all per-
  // agent identity tasks share a millisecond-bucketed timestamp.
  const baseTime = Date.now();
  const manifest: BuildManifest = {
    version: 3,
    agentName,
    createdAt: new Date().toISOString(),
    plan: '.openclaw/plan/architecture.json',
    tasks: plannedTasks.map((p, i) => ({
      id: `${p.specialist}${p.target ? `-${p.target.id}` : ''}-${baseTime}-${i}`,
      specialist: p.specialist,
      status: 'pending' as const,
      files: [],
      ...(p.target ? { targetAgentId: p.target.id } : {}),
    })),
  };

  // Total used for progress reporting.
  const allTasks = plannedTasks;

  // Lookup is keyed on (specialist, targetAgentId?). Specialists without a
  // target (scaffold, database, backend, dashboard, verify) match the
  // single task with that specialist; per-agent specialists (identity,
  // skills in a fleet) require the targetAgentId to disambiguate.
  const findTask = (s: string, targetId?: string) =>
    manifest.tasks.find((t) => t.specialist === s && t.targetAgentId === targetId);
  let completed = 0;
  const setupStepsForReport: Array<{ name: string; ok: boolean; optional?: boolean; output?: string; skipped?: boolean }> = [];
  const servicesForReport: Array<{ name: string; healthy: boolean; optional?: boolean; port?: number }> = [];

  try {
    // ── Phase 1: Scaffold (deterministic) ───────────────────────────────────
    checkCancelled();
    yield { type: 'status', message: 'Generating scaffold files...' };
    const scaffoldTask = findTask('scaffold')!;
    scaffoldTask.status = 'running';
    scaffoldTask.startedAt = new Date().toISOString();
    yield { type: 'task_start', specialist: 'scaffold' };

    try {
      const pruneErr = await pruneStaleScaffoldFiles(sandboxId, plan);
      if (pruneErr) yield pruneErr;

      const files = generateScaffoldFiles(plan, agentName);
      const results = await writeWorkspaceFiles(sandboxId, files.map((f) => ({ path: f.path, content: f.content })));

      for (const r of results) {
        if (r.ok) {
          scaffoldTask.files.push(r.path);
          yield { type: 'file_written', path: r.path };
        }
      }

      scaffoldTask.status = 'done';
      scaffoldTask.completedAt = new Date().toISOString();
      completed++;
      yield { type: 'task_complete', specialist: 'scaffold', files: scaffoldTask.files };
      yield { type: 'progress', completed, total: allTasks.length };
      const manifestErr = await persistManifest(sandboxId, manifest);
      if (manifestErr) yield manifestErr;
    } catch (err) {
      scaffoldTask.status = 'failed';
      scaffoldTask.error = err instanceof Error ? err.message : String(err);
      yield { type: 'task_failed', specialist: 'scaffold', error: scaffoldTask.error };
    }

    // ── Pre-phase 2: Ensure scaffold + architecture are in main workspace ──
    // Specialists read and write $HOME/.openclaw/workspace. The deterministic
    // scaffold is generated in workspace-copilot first so the UI can inspect it;
    // copy it into main before asking specialists to extend it.
    try {
      await mergeWorkspaceCopilotToMain(sandboxId);
      const containerName = getContainerName(sandboxId);
      const writePlanCommand = buildHomeFileWriteCommand(
        '.openclaw/workspace/.openclaw/plan/architecture.json',
        JSON.stringify(plan, null, 2),
      );
      const [ok, output] = await dockerExec(containerName, writePlanCommand, 10_000);
      if (!ok) throw new Error(output || 'Failed to write architecture plan to main workspace');
    } catch (err) {
      yield { type: 'status', message: `Main workspace sync warning: ${err instanceof Error ? err.message : String(err)}` };
      const containerName = getContainerName(sandboxId);
      await dockerExec(
        containerName,
        'mkdir -p $HOME/.openclaw/workspace/.openclaw/plan && ' +
          'cp $HOME/.openclaw/workspace-copilot/.openclaw/plan/architecture.json ' +
          '$HOME/.openclaw/workspace/.openclaw/plan/architecture.json 2>/dev/null || true',
        10000,
      );
    }

    // ── Phase 2: Specialists (LLM via gateway) ──────────────────────────────
    checkCancelled();

    // Run specialists sequentially. The gateway processes requests on a single
    // lane, so parallel HTTP calls just queue up and cause contention/timeouts.
    // The parallelBuild flag is accepted but currently has no effect on specialist
    // execution order — it will be enabled when the gateway supports concurrent lanes.
    //
    // Path B Slice 3: identity and skills now multiply per-agent when a fleet
    // was emitted by the architect. We iterate over the planned-tasks list
    // (which already encodes the per-target multiplication) instead of
    // walking `specialists` and calling each once.
    for (const planned of plannedTasks) {
      // Skip scaffold (handled in Phase 1) and verify (handled in Phase 5).
      if (planned.specialist === 'scaffold' || planned.specialist === 'verify') continue;
      checkCancelled();

      const task = findTask(planned.specialist, planned.target?.id)!;
      const targetSuffix = planned.target ? ` (${planned.target.id})` : '';
      yield { type: 'task_start', specialist: planned.specialist };
      yield { type: 'status', message: `Running ${planned.specialist}${targetSuffix} specialist...` };
      const result = await executeSpecialist(
        sandboxId,
        planned.specialist,
        plan,
        agentName,
        task,
        signal,
        planned.target,
      );

      for (const evt of result.events) {
        if (evt.type === 'task_start') continue;
        if (evt.type === 'status' && evt.message?.startsWith(`Running ${planned.specialist}`)) continue;
        yield evt;
      }

      completed++;
      yield { type: 'progress', completed, total: allTasks.length };
      const manifestErr = await persistManifest(sandboxId, manifest);
      if (manifestErr) yield manifestErr;
    }

    // ── Phase 3: Merge workspace ────────────────────────────────────────────
    checkCancelled();
    yield { type: 'status', message: 'Merging build output...' };
    try {
      const { mergeWorkspaceCopilotToMain } = await import('./workspaceWriter');
      await mergeWorkspaceCopilotToMain(sandboxId);
    } catch (err) {
      yield { type: 'status', message: `Workspace merge warning: ${err instanceof Error ? err.message : String(err)}` };
    }

    // ── Phase 4: Setup (npm install + dashboard build + start services) ─────
    checkCancelled();
    yield { type: 'setup_progress', message: 'Starting setup phase...', setupPhase: 'init' };
    try {
      const { runAgentSetup } = await import('./agentSetup');

      // Fix 4: Bridge setup callbacks to yielded events via async queue
      const setupQueue = createAsyncQueue<BuildEvent>();

      const setupPromise = runAgentSetup(sandboxId, (msg) => {
        setupQueue.push({ type: 'setup_progress', message: msg, setupPhase: 'setup' });
      }).finally(() => setupQueue.end());

      // Yield setup events in real-time as they arrive
      for await (const evt of setupQueue) {
        checkCancelled();
        yield evt;
      }

      const setupResult = await setupPromise;
      setupStepsForReport.push(...setupResult.infrastructure);
      if (setupResult.install) setupStepsForReport.push(setupResult.install);
      setupStepsForReport.push(...setupResult.setup);

      for (const svc of setupResult.services ?? []) {
        servicesForReport.push({
          name: svc.name,
          healthy: svc.healthy,
          optional: svc.optional,
          port: svc.port,
        });
        yield { type: 'setup_progress', message: `Service ${svc.name}: ${svc.healthy ? 'healthy' : 'unhealthy'} (port ${svc.port})`, setupPhase: 'services' };
      }

      // Persist service ports on agent record
      if (setupResult.services?.length) {
        const { updateAgentConfig } = await import('./agentStore');
        const ports = setupResult.services.map((s) => ({ name: s.name, port: s.port, healthy: s.healthy ?? false }));
        await updateAgentConfig(agentId, { servicePorts: ports });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setupStepsForReport.push({ name: 'setup', ok: false, output: message });
      yield { type: 'setup_progress', message: `Setup warning: ${message}`, setupPhase: 'error' };
    }

    // ── Phase 5: Verification specialist ────────────────────────────────────
    checkCancelled();
    const verifyTask = findTask('verify');
    if (verifyTask) {
      verifyTask.status = 'running';
      verifyTask.startedAt = new Date().toISOString();
      yield { type: 'task_start', specialist: 'verify' };
      yield { type: 'status', message: 'Running verification specialist...' };

      try {
        const verificationPlan = await writeVerificationPlan(sandboxId, plan, agentName);
        yield { type: 'status', message: `Verification plan: ${verificationPlan.checks.length} checks` };

        const verifyPrompt = getSpecialistPrompt('verify' as SpecialistType, plan, agentName);
        if (verifyPrompt) {
          const result = await callSpecialist(sandboxId, verifyPrompt, undefined, signal);
          verifyTask.files = result.files;
        }

        verifyTask.status = 'done';
        verifyTask.completedAt = new Date().toISOString();
        completed++;
        yield { type: 'task_complete', specialist: 'verify', files: verifyTask.files };
      } catch (err) {
        verifyTask.status = 'failed';
        verifyTask.error = err instanceof Error ? err.message : String(err);
        verifyTask.completedAt = new Date().toISOString();
        completed++;
        yield { type: 'task_failed', specialist: 'verify', error: verifyTask.error };
      }
      yield { type: 'progress', completed, total: allTasks.length };
    }

    // ── Complete ────────────────────────────────────────────────────────────
    manifest.completedAt = new Date().toISOString();
    const buildReport = summarizeBuildReport({
      manifestTasks: manifest.tasks,
      setup: setupStepsForReport,
      services: servicesForReport,
      verification: { status: verifyTask?.status === 'done' ? 'done' : verifyTask?.status ?? 'pending', checks: [] },
    });
    const reportErr = await persistBuildReport(sandboxId, buildReport);
    if (reportErr) yield reportErr;
    yield { type: 'build_report', report: buildReport };
    const finalErr = await persistManifest(sandboxId, manifest);
    if (finalErr) yield finalErr;
    yield { type: 'build_complete', manifest };

  } catch (err) {
    // Fix 5: Handle cancellation gracefully
    if (err instanceof DOMException && err.name === 'AbortError') {
      yield { type: 'error', message: 'Build cancelled by user' };
    } else {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }
}
