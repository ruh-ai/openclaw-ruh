import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type ExecutionJobData, type LearningJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { spawnAgentProcess } from './subprocess';
import * as queueJobStore from '../stores/queueJobStore';
import * as taskStore from '../stores/taskStore';
import * as boardTaskStore from '../stores/boardTaskStore';
import { execution as log } from '../logger';

/**
 * Classify a failure as retryable or permanent.
 * Retryable: timeout, rate limit, transient network error.
 * Permanent: agent file missing, invalid prompt, capability gap.
 */
function classifyFailure(stderr: string, killed: boolean, exitCode: number | null): {
  retryable: boolean;
  category: 'timeout' | 'rate-limit' | 'transient' | 'capability-gap' | 'agent-error' | 'unknown';
  reason: string;
} {
  const err = (stderr || '').toLowerCase();

  if (killed) {
    return { retryable: true, category: 'timeout', reason: 'Task timed out — may succeed with more time' };
  }

  if (err.includes('rate limit') || err.includes('429') || err.includes('too many requests')) {
    return { retryable: true, category: 'rate-limit', reason: 'API rate limited — will succeed after cooldown' };
  }

  if (err.includes('econnrefused') || err.includes('econnreset') || err.includes('network') || err.includes('fetch failed')) {
    return { retryable: true, category: 'transient', reason: 'Network error — transient, will retry' };
  }

  if (err.includes('agent file') || err.includes('not found') || err.includes('no such file')) {
    return { retryable: false, category: 'agent-error', reason: 'Agent file or dependency missing — permanent failure' };
  }

  if (err.includes('cannot') || err.includes('unable to') || err.includes('don\'t know how')) {
    return { retryable: false, category: 'capability-gap', reason: 'Agent lacks capability for this task type' };
  }

  // Default: retry once, then give up
  if (exitCode !== null && exitCode > 1) {
    return { retryable: false, category: 'agent-error', reason: `Agent exited with code ${exitCode}` };
  }

  return { retryable: true, category: 'unknown', reason: 'Unknown failure — will retry' };
}

export function createExecutionWorker(): Worker<ExecutionJobData> {
  const config = getConfig();

  const worker = new Worker<ExecutionJobData>(
    QUEUE_NAMES.EXECUTION,
    async (job: Job<ExecutionJobData>) => {
      const { taskLogId, queueJobId, agentName, agentPath, prompt, timeout } = job.data;
      log.info({ agentName, taskLogId }, 'Starting execution');

      // Update status to running
      await queueJobStore.updateQueueJob(queueJobId, {
        status: 'active',
        startedAt: new Date().toISOString(),
        attempts: (job.attemptsMade || 0) + 1,
      });

      await taskStore.updateTask(taskLogId, { status: 'running' });

      publish({ type: 'task', action: 'updated', data: { taskLogId, status: 'running', agent: agentName } });

      // Spawn the selected agent runner subprocess
      const result = await spawnAgentProcess({
        jobId: job.id ?? queueJobId,
        agentPath,
        prompt,
        timeout,
        dangerouslySkipPermissions: true,
      });

      // Parse structured output
      let outputJson: unknown = null;
      let filesChanged: string[] = [];
      if (result.success && result.stdout) {
        try {
          const parsed = JSON.parse(result.stdout);
          outputJson = parsed;
          if (Array.isArray(parsed?.filesChanged)) {
            filesChanged = parsed.filesChanged;
          }
        } catch {
          // Output wasn't valid JSON — store raw
          outputJson = { raw: result.stdout };
        }
      }

      // Update task and queue job
      const finalStatus = result.success ? 'completed' : 'failed';

      await queueJobStore.updateQueueJob(queueJobId, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        resultJson: outputJson,
        errorMessage: result.success ? undefined : (result.stderr || 'Execution failed'),
      });

      await taskStore.updateTask(taskLogId, {
        status: finalStatus,
        resultSummary: result.success ? `Agent ${agentName} completed successfully` : undefined,
        error: result.success ? undefined : (result.killed ? 'Timed out' : result.stderr?.slice(0, 500)),
      });

      await boardTaskStore.syncBoardTaskFromTaskLog(taskLogId, {
        taskStatus: finalStatus,
        agentName,
        error: result.success ? null : (result.killed ? 'Timed out' : result.stderr?.slice(0, 500)),
      });

      publish({ type: 'task', action: 'updated', data: { taskLogId, status: finalStatus, agent: agentName } });

      // Enqueue learning job
      const learningData: LearningJobData = {
        taskLogId,
        queueJobId,
        agentName,
        success: result.success,
        output: result.stdout || null,
        error: result.success ? null : (result.stderr || null),
        durationMs: result.durationMs,
        filesChanged,
        description: prompt.split('\n')[0].slice(0, 200),
      };

      await getQueue(QUEUE_NAMES.LEARNING).add('learn', learningData);

      log.info({ status: finalStatus, agentName, taskLogId, durationMs: result.durationMs }, 'Execution finished');

      if (!result.success) {
        const classification = classifyFailure(result.stderr || '', result.killed, result.exitCode);
        log.info({ category: classification.category, retryable: classification.retryable, reason: classification.reason }, 'Failure classified');

        if (!classification.retryable) {
          // Permanent failure — don't let BullMQ retry
          throw new UnrecoverableError(`[${classification.category}] ${classification.reason}: ${(result.stderr || '').slice(0, 150)}`);
        }

        throw new Error(`[${classification.category}] ${result.killed ? `Timed out after ${timeout}ms` : (result.stderr || '').slice(0, 200)}`);
      }

      return { taskLogId, success: true, durationMs: result.durationMs };
    },
    {
      connection: getRedis(),
      concurrency: config.workerConcurrency,
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, 'Job failed');
  });

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job completed');
  });

  return worker;
}
