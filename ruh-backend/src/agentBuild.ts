/**
 * agentBuild.ts — Server-side build pipeline for agent creation.
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
import { generateScaffoldFiles, type ArchitecturePlan } from './scaffoldTemplates';
import { getSpecialistPrompt, getRequiredSpecialists, type SpecialistType } from './specialistPrompts';
import { writeWorkspaceFile, writeWorkspaceFiles } from './workspaceWriter';
import { dockerExec, getContainerName } from './docker';
import { gatewayUrlAndHeaders } from './utils';
import * as store from './store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildEvent {
  type: "task_start" | "task_complete" | "task_failed" | "file_written"
    | "progress" | "status" | "build_complete" | "error"
    | "setup_progress";
  specialist?: string;
  files?: string[];
  error?: string;
  path?: string;
  completed?: number;
  total?: number;
  message?: string;
  manifest?: BuildManifest;
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

// ─── Utilities ─────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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
  let lastDataAt = Date.now();
  const INACTIVITY_MS = 120_000;
  const HARD_TIMEOUT_MS = 10 * 60 * 1000;
  const startedAt = Date.now();

  const inactivityCheck = setInterval(() => {
    const now = Date.now();
    if (now - lastDataAt > INACTIVITY_MS || now - startedAt > HARD_TIMEOUT_MS) {
      try { reader.cancel(); } catch { /* ignore */ }
      clearInterval(inactivityCheck);
    }
  }, 5_000);

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      lastDataAt = Date.now();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        // [DONE] means the gateway finished — break immediately
        if (data === '[DONE]') {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(data);
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
        } catch { /* non-JSON SSE line, skip */ }
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
    await writeWorkspaceFile(sandboxId, '.openclaw/plan/build-manifest.json', JSON.stringify(manifest, null, 2));
    return null;
  } catch (err) {
    const message = `Warning: manifest save failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[agentBuild] ${message}`);
    return { type: 'status', message };
  }
}

// ─── Execute a single specialist (returns collected events) ────────────────

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
): Promise<SpecialistResult> {
  const events: BuildEvent[] = [];
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  events.push({ type: 'task_start', specialist });
  events.push({ type: 'status', message: `Running ${specialist} specialist...` });

  // Dashboard is handled by scaffold — skip LLM call
  if (specialist === 'dashboard') {
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: [] });
    return { events, files: [] };
  }

  const prompt = getSpecialistPrompt(specialist as SpecialistType, plan, agentName);
  if (!prompt) {
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: [] });
    return { events, files: [] };
  }

  // Fix 2: Chunk skills if > 3 to avoid single-point timeout
  if (specialist === 'skills' && plan.skills.length > 3) {
    return executeChunkedSkills(sandboxId, plan, agentName, task, signal);
  }

  try {
    const result = await callSpecialist(sandboxId, prompt, undefined, signal);
    task.files = result.files;
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    events.push({ type: 'task_complete', specialist, files: result.files });
    return { events, files: result.files };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
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
): Promise<SpecialistResult> {
  const events: BuildEvent[] = [];
  const CHUNK_SIZE = 3;
  const chunks = chunkArray(plan.skills, CHUNK_SIZE);
  const allFiles: string[] = [];

  events.push({ type: 'status', message: `Building ${plan.skills.length} skills in ${chunks.length} chunks...` });

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException('Build cancelled', 'AbortError');

    const chunk = chunks[i];
    const skillIds = chunk.map((s) => s.id).join(', ');
    events.push({ type: 'status', message: `Skills chunk ${i + 1}/${chunks.length}: ${skillIds}` });

    // Build a scoped plan with only the chunk's skills
    const scopedPlan = { ...plan, skills: chunk };
    const prompt = getSpecialistPrompt('skills' as SpecialistType, scopedPlan, agentName);
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

  task.files = allFiles;
  task.status = allFiles.length > 0 ? 'done' : 'failed';
  task.completedAt = new Date().toISOString();
  if (task.status === 'done') {
    events.push({ type: 'task_complete', specialist: 'skills', files: allFiles });
  } else {
    task.error = 'All skill chunks failed';
    events.push({ type: 'task_failed', specialist: 'skills', error: task.error });
  }
  return { events, files: allFiles, error: task.status === 'failed' ? task.error : undefined };
}

// ─── Main build pipeline (async generator) ──────────────────────────────────

export async function* runAgentBuild(
  agentId: string,
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
  options?: BuildOptions,
): AsyncGenerator<BuildEvent> {
  const signal = options?.signal;

  // Fix 5: cancellation check helper
  function checkCancelled() {
    if (signal?.aborted) {
      throw new DOMException('Build cancelled', 'AbortError');
    }
  }

  const specialists = getRequiredSpecialists(plan);
  const allTasks = ['scaffold', ...specialists, 'verify'];

  const manifest: BuildManifest = {
    version: 3,
    agentName,
    createdAt: new Date().toISOString(),
    plan: '.openclaw/plan/architecture.json',
    tasks: allTasks.map((s) => ({ id: `${s}-${Date.now()}`, specialist: s, status: 'pending' as const, files: [] })),
  };

  const findTask = (s: string) => manifest.tasks.find((t) => t.specialist === s);
  let completed = 0;

  try {
    // ── Phase 1: Scaffold (deterministic) ───────────────────────────────────
    checkCancelled();
    yield { type: 'status', message: 'Generating scaffold files...' };
    const scaffoldTask = findTask('scaffold')!;
    scaffoldTask.status = 'running';
    scaffoldTask.startedAt = new Date().toISOString();
    yield { type: 'task_start', specialist: 'scaffold' };

    try {
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

    // ── Pre-phase 2: Ensure architecture.json is in the main workspace ─────
    // The plan lives in workspace-copilot/ after the Think/Plan stages, but
    // specialist prompts tell the architect to read from workspace/. Copy it
    // so specialists can find it without falling back to directory search.
    try {
      const containerName = getContainerName(sandboxId);
      await dockerExec(containerName,
        'mkdir -p $HOME/.openclaw/workspace/.openclaw/plan && ' +
        'cp $HOME/.openclaw/workspace-copilot/.openclaw/plan/architecture.json ' +
        '$HOME/.openclaw/workspace/.openclaw/plan/architecture.json 2>/dev/null || true',
        10000);
    } catch { /* non-fatal — specialists may still find it via fallback */ }

    // ── Phase 2: Specialists (LLM via gateway) ──────────────────────────────
    checkCancelled();

    // Run specialists sequentially. The gateway processes requests on a single
    // lane, so parallel HTTP calls just queue up and cause contention/timeouts.
    // The parallelBuild flag is accepted but currently has no effect on specialist
    // execution order — it will be enabled when the gateway supports concurrent lanes.
    for (const specialist of specialists) {
      checkCancelled();

      const task = findTask(specialist)!;
      const result = await executeSpecialist(sandboxId, specialist, plan, agentName, task, signal);

      for (const evt of result.events) {
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

      for (const svc of setupResult.services ?? []) {
        yield { type: 'setup_progress', message: `Service ${svc.name}: ${svc.healthy ? 'healthy' : 'unhealthy'} (port ${svc.port})`, setupPhase: 'services' };
      }

      // Persist service ports on agent record
      if (setupResult.services?.length) {
        const { updateAgentConfig } = await import('./agentStore');
        const ports = setupResult.services.map((s) => ({ name: s.name, port: s.port, healthy: s.healthy ?? false }));
        await updateAgentConfig(agentId, { servicePorts: ports });
      }
    } catch (err) {
      yield { type: 'setup_progress', message: `Setup warning: ${err instanceof Error ? err.message : String(err)}`, setupPhase: 'error' };
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
        const containerName = getContainerName(sandboxId);
        await dockerExec(containerName, `mkdir -p $HOME/.openclaw/workspace/.openclaw/build`, 5000);

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
