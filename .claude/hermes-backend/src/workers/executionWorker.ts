import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type ExecutionJobData, type LearningJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { spawnAgentProcess } from './subprocess';
import { createWorktree, removeWorktree, type WorktreeInfo } from './worktreeManager';
import * as queueJobStore from '../stores/queueJobStore';
import * as taskStore from '../stores/taskStore';
import * as boardTaskStore from '../stores/boardTaskStore';

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

  // killed=true means our timeout callback fired. Exit codes 128+signal also
  // indicate the process was terminated (143=SIGTERM, 137=SIGKILL). Due to race
  // conditions the killed flag may not be set even when our timeout fires, so
  // treat signal-based exit codes as timeouts too.
  if (killed || exitCode === 143 || exitCode === 137) {
    return { retryable: true, category: 'timeout', reason: 'Task timed out or was killed by signal — may succeed with more time' };
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
      console.log(`[hermes:execution] Starting: agent=${agentName} task=${taskLogId}`);

      // Update status to running
      await queueJobStore.updateQueueJob(queueJobId, {
        status: 'active',
        startedAt: new Date().toISOString(),
        attempts: (job.attemptsMade || 0) + 1,
      });

      await taskStore.updateTask(taskLogId, { status: 'running' });

      publish({ type: 'task', action: 'updated', data: { taskLogId, status: 'running', agent: agentName } });

      // Create per-job worktree if enabled
      let worktree: WorktreeInfo | null = null;
      if (config.enableWorktreeIsolation) {
        try {
          worktree = await createWorktree({
            jobId: job.id ?? queueJobId,
            agentName,
            projectRoot: config.projectRoot,
          });
          if (worktree.created) {
            console.log(`[hermes:execution] Worktree created: ${worktree.branchName} at ${worktree.worktreePath}`);
          }
        } catch (err) {
          console.warn(`[hermes:execution] Worktree creation failed, falling back to repo root:`, err);
          worktree = null;
        }
      }

      // Resolve agent path: use worktree-local copy if worktree was created
      const effectiveAgentPath = worktree?.created
        ? agentPath.replace(config.projectRoot, worktree.worktreePath)
        : agentPath;

      // Spawn the selected agent runner subprocess
      const result = await spawnAgentProcess({
        jobId: job.id ?? queueJobId,
        agentPath: effectiveAgentPath,
        prompt,
        timeout,
        dangerouslySkipPermissions: true,
        cwd: worktree?.created ? worktree.worktreePath : undefined,
      });

      // Parse structured output
      let outputJson: unknown = null;
      let filesChanged: string[] = [];
      if (result.success && result.stdout) {
        try {
          const parsed = JSON.parse(result.stdout);
          outputJson = parsed;
          if (worktree?.created && Array.isArray(parsed?.filesChanged)) {
            // Normalize paths from worktree-relative back to repo-relative
            filesChanged = parsed.filesChanged.map((f: string) =>
              f.startsWith(worktree!.worktreePath)
                ? f.replace(worktree!.worktreePath, config.projectRoot)
                : f
            );
          } else if (Array.isArray(parsed?.filesChanged)) {
            filesChanged = parsed.filesChanged;
          }
        } catch {
          // Output wasn't valid JSON — store raw
          outputJson = { raw: result.stdout };
        }
      }

      // Build a descriptive error message that never falls through to undefined/empty
      const errorMessage = result.success
        ? undefined
        : (result.killed
          ? 'Timed out'
          : (result.stderr?.slice(0, 500) || `Process exited with code ${result.exitCode}`));

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
        error: errorMessage,
      });

      await boardTaskStore.syncBoardTaskFromTaskLog(taskLogId, {
        taskStatus: finalStatus,
        agentName,
        error: result.success ? null : (errorMessage ?? null),
      });

      publish({ type: 'task', action: 'updated', data: { taskLogId, status: finalStatus, agent: agentName } });

      // Clean up worktree
      if (worktree?.created) {
        try {
          if (result.success) {
            // On success: remove worktree directory but KEEP the branch for review/merge
            await removeWorktree(worktree, { deleteBranch: false });
            console.log(`[hermes:execution] Worktree removed, branch ${worktree.branchName} preserved`);
          } else {
            // On failure: remove worktree AND branch (nothing to keep)
            await removeWorktree(worktree, { deleteBranch: true });
            console.log(`[hermes:execution] Worktree and branch cleaned up after failure`);
          }
        } catch (cleanupErr) {
          console.warn(`[hermes:execution] Worktree cleanup failed:`, cleanupErr);
        }
      }

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
        worktreeBranch: worktree?.created && result.success ? worktree.branchName : undefined,
      };

      await getQueue(QUEUE_NAMES.LEARNING).add('learn', learningData);

      console.log(`[hermes:execution] ${finalStatus}: agent=${agentName} task=${taskLogId} (${result.durationMs}ms)`);

      if (!result.success) {
        const classification = classifyFailure(result.stderr || '', result.killed, result.exitCode);
        console.log(`[hermes:execution] Failure classified: ${classification.category} (retryable: ${classification.retryable}) — ${classification.reason}`);

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
    console.error(`[hermes:execution] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[hermes:execution] Job ${job.id} completed`);
  });

  return worker;
}
