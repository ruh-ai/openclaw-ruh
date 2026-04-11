import { Worker, type Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type IngestionJobData, type ExecutionJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import * as queueJobStore from '../stores/queueJobStore';
import * as taskStore from '../stores/taskStore';
import * as boardTaskStore from '../stores/boardTaskStore';
import { isAgentAvailable } from '../circuitBreaker';
import { query } from '../db';
import { spawn } from 'bun';
import path from 'path';
import fs from 'fs';
import { ingestion as log } from '../logger';

/**
 * Generate a deduplication hash for a task description + agent combo.
 * Used to prevent duplicate tasks from being created.
 */
function dedupHash(description: string, agentName: string): string {
  // Normalize: lowercase, collapse whitespace, strip common prefixes
  const normalized = description.toLowerCase().replace(/\s+/g, ' ').replace(/^\[(retry|evolution-test|factory-test)\]\s*/i, '').trim();
  return crypto.createHash('sha256').update(`${agentName}:${normalized}`).digest('hex').slice(0, 16);
}

/**
 * Check if a task with this dedup hash already exists and is active (running/queued).
 */
async function isDuplicate(hash: string): Promise<boolean> {
  const result = await query(
    `SELECT COUNT(*) as cnt FROM task_logs
     WHERE dedup_hash = $1
     AND status IN ('running', 'pending')
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [hash],
  );
  return parseInt(String(result.rows[0]?.cnt || '0'), 10) > 0;
}

/**
 * Determine the best agent for a task based on description keywords and available agents.
 */
function routeToAgent(description: string, requestedAgent?: string): { agentName: string; agentPath: string } {
  const config = getConfig();

  if (requestedAgent && requestedAgent !== 'auto') {
    const agentPath = path.join(config.agentsDir, `${requestedAgent}.md`);
    return { agentName: requestedAgent, agentPath };
  }

  // Keyword-based routing with weighted scoring
  const desc = description.toLowerCase();
  const routes: Array<{ keywords: string[]; agent: string }> = [
    { keywords: ['ruh-backend', 'ruh_backend', 'sandboxmanager', 'agentstore', 'sessionstore', 'channelmanager', 'express route', 'backend endpoint', 'postgres schema', 'database migration', 'schemamigration'], agent: 'backend' },
    { keywords: ['agent-builder-ui', 'ruh-frontend', 'admin-ui', 'next.js page', 'react component', 'marketplace-ui', 'copilot', 'mission control', 'dashboard page'], agent: 'frontend' },
    { keywords: ['flutter', 'dart', 'riverpod', 'ruh_app', 'pubspec', 'widget', 'ios', 'android', 'macos app'], agent: 'flutter' },
    { keywords: ['test coverage', 'unit test', 'jest test', 'bun test', 'playwright', 'e2e test', 'test suite', 'coverage threshold', 'test:all', 'check-coverage'], agent: 'test' },
    { keywords: ['code review', 'review pr', 'review changes', 'convention check', 'kb compliance', 'pre-landing review', 'lint'], agent: 'reviewer' },
    { keywords: ['docker container', 'sandbox', 'openclaw gateway', 'docker exec', 'container lifecycle', 'gateway status'], agent: 'sandbox' },
    { keywords: ['analyze goal', 'decompose goal', 'plan tasks', 'break down goal', 'goal decomposition'], agent: 'analyst' },
    { keywords: ['system assessment', 'propose goals', 'strategic review', 'codebase health', 'project priorities', 'trend detection'], agent: 'strategist' },
  ];

  // Also match broader terms as fallback (lower priority)
  const broadRoutes: Array<{ keywords: string[]; agent: string }> = [
    { keywords: ['api', 'endpoint', 'database', 'postgres', 'migration', 'auth middleware', 'backend'], agent: 'backend' },
    { keywords: ['ui', 'page', 'component', 'frontend', 'css', 'tailwind', 'layout'], agent: 'frontend' },
    { keywords: ['mobile', 'native', 'app store'], agent: 'flutter' },
    { keywords: ['test', 'coverage', 'spec', 'assert'], agent: 'test' },
    { keywords: ['review', 'pr ', 'convention'], agent: 'reviewer' },
    { keywords: ['docker', 'container', 'gateway'], agent: 'sandbox' },
  ];

  // Try specific routes first
  for (const route of routes) {
    if (route.keywords.some(k => desc.includes(k))) {
      return { agentName: route.agent, agentPath: path.join(config.agentsDir, `${route.agent}.md`) };
    }
  }

  // Then try broad routes
  for (const route of broadRoutes) {
    if (route.keywords.some(k => desc.includes(k))) {
      return { agentName: route.agent, agentPath: path.join(config.agentsDir, `${route.agent}.md`) };
    }
  }

  // Default to hermes for complex/ambiguous tasks
  return { agentName: 'hermes', agentPath: path.join(config.agentsDir, 'hermes.md') };
}

/**
 * Query cold memory for context relevant to this task.
 */
async function queryMemoryContext(description: string): Promise<string> {
  const config = getConfig();
  const scriptPath = path.join(config.projectRoot, '.claude', 'scripts', 'memory-query.py');

  if (!fs.existsSync(scriptPath)) return '';

  try {
    const proc = spawn({
      cmd: ['python3', scriptPath, description, '--top-k', '3'],
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: config.projectRoot,
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) return '';

    const output = await new Response(proc.stdout).text();
    return output.trim();
  } catch {
    return '';
  }
}

/**
 * Assemble the full prompt for the execution worker.
 */
function assemblePrompt(description: string, memoryContext: string): string {
  const parts = [description];

  if (memoryContext) {
    parts.push('\n\n## Relevant Memory Context\n' + memoryContext);
  }

  parts.push('\n\n## Instructions');
  parts.push('- Complete the task described above.');
  parts.push('- If you make code changes, ensure they compile/typecheck.');
  parts.push('- Report what you changed and any issues encountered.');
  parts.push('- At the end of your output, include self-evolution markers:');
  parts.push('  LEARNING: <type> | <description> — for patterns, pitfalls, or debug paths discovered');
  parts.push('  SKILL_ACQUIRED: <description> — for new capabilities you used');
  parts.push('  GAP: <description> — for missing knowledge or tools that blocked you');

  return parts.join('\n');
}

export function createIngestionWorker(): Worker<IngestionJobData> {
  const config = getConfig();

  const worker = new Worker<IngestionJobData>(
    QUEUE_NAMES.INGESTION,
    async (job: Job<IngestionJobData>) => {
      const { description, source, agentName, priority, timeout, goalId, metadata } = job.data;
      const boardTaskId = typeof metadata?.boardTaskId === 'string' ? metadata.boardTaskId : undefined;
      log.info({ description: description.slice(0, 80) }, 'Processing task');

      // 1. Route to best agent
      const { agentName: resolvedAgent, agentPath } = routeToAgent(description, agentName);

      // 1b. Circuit breaker check — skip if agent is tripped
      const circuit = await isAgentAvailable(resolvedAgent);
      if (!circuit.available) {
        log.info({ agent: resolvedAgent, reason: circuit.reason }, 'Skipped: circuit open');
        // Re-queue with delay to try again later
        await getQueue(QUEUE_NAMES.INGESTION).add('ingest', job.data, {
          delay: 600_000, // retry in 10 minutes
          priority: (priority ?? 5) + 2, // lower priority on retry
        });
        return { skipped: true, reason: circuit.reason };
      }

      // 1c. Deduplication check — skip if identical active task exists
      const hash = dedupHash(description, resolvedAgent);
      if (await isDuplicate(hash)) {
        log.info({ agent: resolvedAgent, description: description.slice(0, 60) }, 'Dedup: skipped duplicate task');
        return { skipped: true, reason: 'duplicate' };
      }

      // 2. Query cold memory for context
      const memoryContext = await queryMemoryContext(description);

      // 3. Assemble prompt
      const prompt = assemblePrompt(description, memoryContext);

      // 4. Create task_log entry
      // Map numeric priority to string for task_logs CHECK constraint
      const priorityNum = priority ?? 5;
      const priorityStr = priorityNum <= 1 ? 'critical' : priorityNum <= 3 ? 'high' : priorityNum <= 7 ? 'normal' : 'low';
      const taskLog = await taskStore.createTask({
        description,
        delegatedTo: resolvedAgent,
        priority: priorityStr,
        goalId: goalId || undefined,
        boardTaskId,
        dedupHash: hash,
      });

      if (boardTaskId) {
        await boardTaskStore.attachTaskLog(boardTaskId, taskLog.id, resolvedAgent);
      }

      // 5. Create queue_job entry
      const queueJobId = uuidv4();
      await queueJobStore.createQueueJob({
        id: queueJobId,
        queueName: QUEUE_NAMES.EXECUTION,
        jobId: '', // filled after enqueue
        taskLogId: taskLog.id,
        agentName: resolvedAgent,
        priority: priority ?? 5,
        status: 'waiting',
        source,
        prompt,
        maxAttempts: 3,
        timeoutMs: timeout ?? config.executionTimeout,
      });

      // 6. Enqueue execution job
      const executionData: ExecutionJobData = {
        taskLogId: taskLog.id,
        queueJobId,
        agentName: resolvedAgent,
        agentPath,
        prompt,
        priority: priority ?? 5,
        timeout: timeout ?? config.executionTimeout,
      };

      const executionJob = await getQueue(QUEUE_NAMES.EXECUTION).add(
        'execute',
        executionData,
        { priority: priority ?? 5 },
      );

      // Update queue_job with the BullMQ job ID
      await queueJobStore.updateQueueJob(queueJobId, { jobId: executionJob.id ?? '' });

      publish({ type: 'task', action: 'created', data: { taskLogId: taskLog.id, boardTaskId, agent: resolvedAgent, source } });

      log.info({ agent: resolvedAgent, taskLogId: taskLog.id }, 'Routed task');
      return { taskLogId: taskLog.id, queueJobId, agent: resolvedAgent };
    },
    {
      connection: getRedis(),
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.INGESTION],
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'Job failed');
  });

  return worker;
}
