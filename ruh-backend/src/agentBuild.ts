/**
 * agentBuild.ts — Server-side build pipeline for agent creation.
 *
 * @kb: 008-agent-builder-ui 005-data-models
 *
 * Runs entirely on the backend: scaffold → specialists → validation → setup.
 * No browser dependency. Direct docker exec for file writes. Direct gateway
 * HTTP for specialist calls. Yields progress events as an async generator
 * consumed by the SSE endpoint.
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
    | "progress" | "status" | "build_complete" | "error";
  specialist?: string;
  files?: string[];
  error?: string;
  path?: string;
  completed?: number;
  total?: number;
  message?: string;
  manifest?: BuildManifest;
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

// ─── Specialist execution (server-side gateway call) ────────────────────────

async function callSpecialist(
  sandboxId: string,
  prompt: string,
  onStatus?: (msg: string) => void,
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

  // Specialists generate large amounts of code (10+ skill files) and can take 5-8 minutes.
  // Bun's default fetch timeout is ~300s which is too short.
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10 * 60 * 1000), // 10 minutes
  });
  if (!resp.ok) throw new Error(`Gateway returned ${resp.status}`);
  if (!resp.body) throw new Error('No response body from gateway');

  // Stream the SSE response from the gateway, collect text + files
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const filesWritten: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        // OpenAI-format streaming: choices[0].delta.content
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          fullText += delta;
        }
        // Detect tool events (file writes from the architect's shell)
        if (parsed.type === 'file_written' || parsed.event === 'file_written') {
          const path = parsed.path ?? parsed.data?.path;
          if (path) filesWritten.push(path);
        }
      } catch { /* non-JSON SSE line, skip */ }
    }
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

// ─── Manifest persistence ───────────────────────────────────────────────────

async function persistManifest(sandboxId: string, manifest: BuildManifest): Promise<void> {
  await writeWorkspaceFile(sandboxId, '.openclaw/plan/build-manifest.json', JSON.stringify(manifest, null, 2));
}

// ─── Main build pipeline (async generator) ──────────────────────────────────

export async function* runAgentBuild(
  agentId: string,
  sandboxId: string,
  plan: ArchitecturePlan,
  agentName: string,
): AsyncGenerator<BuildEvent> {
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

  // ── Phase 1: Scaffold (deterministic) ───────────────────────────────────
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
    await persistManifest(sandboxId, manifest);
  } catch (err) {
    scaffoldTask.status = 'failed';
    scaffoldTask.error = err instanceof Error ? err.message : String(err);
    yield { type: 'task_failed', specialist: 'scaffold', error: scaffoldTask.error };
  }

  // ── Phase 2: Specialists (LLM via gateway) ──────────────────────────────
  for (const specialist of specialists) {
    const task = findTask(specialist)!;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    yield { type: 'task_start', specialist };
    yield { type: 'status', message: `Running ${specialist} specialist...` };

    // Dashboard is handled by scaffold — skip LLM call
    if (specialist === 'dashboard') {
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      completed++;
      yield { type: 'task_complete', specialist, files: [] };
      yield { type: 'progress', completed, total: allTasks.length };
      continue;
    }

    const prompt = getSpecialistPrompt(specialist as SpecialistType, plan, agentName);
    if (!prompt) {
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      completed++;
      yield { type: 'task_complete', specialist, files: [] };
      yield { type: 'progress', completed, total: allTasks.length };
      continue;
    }

    try {
      const result = await callSpecialist(sandboxId, prompt, (msg) => {
        // Can't yield from callback, but we log
      });

      task.files = result.files;
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      completed++;
      yield { type: 'task_complete', specialist, files: result.files };
      yield { type: 'progress', completed, total: allTasks.length };
      await persistManifest(sandboxId, manifest);
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = new Date().toISOString();
      completed++;
      yield { type: 'task_failed', specialist, error: task.error };
      yield { type: 'progress', completed, total: allTasks.length };
      await persistManifest(sandboxId, manifest);
      // Continue with next specialist — don't abort
    }
  }

  // ── Phase 3: Merge workspace ────────────────────────────────────────────
  yield { type: 'status', message: 'Merging build output...' };
  try {
    const { mergeWorkspaceCopilotToMain } = await import('./workspaceWriter');
    await mergeWorkspaceCopilotToMain(sandboxId);
  } catch (err) {
    yield { type: 'status', message: `Workspace merge warning: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── Phase 4: Setup (npm install + dashboard build + start services) ─────
  yield { type: 'status', message: 'Running setup (npm install + build + start)...' };
  try {
    const { runAgentSetup } = await import('./agentSetup');
    const setupResult = await runAgentSetup(sandboxId, (msg) => {
      // Fire-and-forget status — can't yield from callback
    });

    for (const svc of setupResult.services ?? []) {
      yield { type: 'status', message: `Service ${svc.name}: ${svc.healthy ? 'healthy' : 'unhealthy'} (port ${svc.port})` };
    }

    // Persist service ports on agent record
    if (setupResult.services?.length) {
      const { updateAgentConfig } = await import('./agentStore');
      const ports = setupResult.services.map((s) => ({ name: s.name, port: s.port, healthy: s.healthy ?? false }));
      await updateAgentConfig(agentId, { servicePorts: ports });
    }
  } catch (err) {
    yield { type: 'status', message: `Setup warning: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── Phase 5: Verification specialist ────────────────────────────────────
  const verifyTask = findTask('verify');
  if (verifyTask) {
    verifyTask.status = 'running';
    verifyTask.startedAt = new Date().toISOString();
    yield { type: 'task_start', specialist: 'verify' };
    yield { type: 'status', message: 'Running verification specialist...' };

    try {
      // Generate and write verification plan
      const { generateVerificationPlan } = await import('./scaffoldTemplates') as { generateVerificationPlan?: typeof import('./scaffoldTemplates').generateScaffoldFiles };
      // Simple verification plan — just check key things
      const containerName = getContainerName(sandboxId);
      await dockerExec(containerName, `mkdir -p $HOME/.openclaw/workspace/.openclaw/build`, 5000);

      // Run verification via the architect
      const verifyPrompt = getSpecialistPrompt('verify' as SpecialistType, plan, agentName);
      if (verifyPrompt) {
        const result = await callSpecialist(sandboxId, verifyPrompt);
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
  await persistManifest(sandboxId, manifest);
  yield { type: 'build_complete', manifest };
}
