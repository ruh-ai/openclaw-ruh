import type { Worker } from 'bullmq';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, type EvolutionJobData, type AnalystJobData, closeQueues } from '../queues/definitions';
import { closeFlowProducer } from '../queues/flows';
import { createIngestionWorker } from './ingestionWorker';
import { createExecutionWorker } from './executionWorker';
import { createLearningWorker } from './learningWorker';
import { createEvolutionWorker } from './evolutionWorker';
import { createFactoryWorker } from './factoryWorker';
import { createAnalystWorker } from './analystWorker';
import { killAllSubprocesses, activeSubprocessCount } from './subprocess';
import { pruneStaleWorktrees, listHermesWorktrees, removeWorktree } from './worktreeManager';
import * as workerPoolStore from '../stores/workerPoolStore';
import * as goalStore from '../stores/goalStore';
import * as scheduledTaskStore from '../stores/scheduledTaskStore';
import { publish } from '../eventBus';

export async function shouldRunBuiltInSchedule(scheduleName: string): Promise<boolean> {
  try {
    const schedule = await scheduledTaskStore.getScheduledTaskByName(scheduleName);
    return schedule?.enabled ?? true;
  } catch (err) {
    console.warn(`[hermes:workers] Could not read built-in schedule "${scheduleName}", defaulting to enabled`, err);
    return true;
  }
}

export class WorkerManager {
  private workerMap = new Map<string, Worker>();
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;

    console.log('[hermes:workers] Starting worker pool...');

    // Create all workers and store in Map keyed by queue name
    const workers: Array<[string, Worker]> = [
      [QUEUE_NAMES.INGESTION, createIngestionWorker()],
      [QUEUE_NAMES.EXECUTION, createExecutionWorker()],
      [QUEUE_NAMES.LEARNING, createLearningWorker()],
      [QUEUE_NAMES.EVOLUTION, createEvolutionWorker()],
      [QUEUE_NAMES.FACTORY, createFactoryWorker()],
      [QUEUE_NAMES.ANALYST, createAnalystWorker()],
    ];

    for (const [name, worker] of workers) {
      this.workerMap.set(name, worker);
    }

    // Clean up stale hermes worktrees from previous runs
    try {
      const config = getConfig();
      if (config.enableWorktreeIsolation) {
        const pruned = await pruneStaleWorktrees(config.projectRoot);
        if (pruned > 0) {
          console.log(`[hermes:workers] Pruned ${pruned} stale worktrees`);
        }
      }
    } catch (err) {
      console.warn('[hermes:workers] Stale worktree cleanup failed:', err);
    }

    this.running = true;
    console.log(`[hermes:workers] ${this.workerMap.size} workers started`);
  }

  /**
   * Register scheduled repeatable jobs for autonomous operation.
   */
  async registerSchedules(): Promise<void> {
    const config = getConfig();
    const evolutionQueue = getQueue(QUEUE_NAMES.EVOLUTION);
    const analystQueue = getQueue(QUEUE_NAMES.ANALYST);

    // Evolution analysis — every 2 hours
    await evolutionQueue.upsertJobScheduler(
      'evolution-analysis',
      { every: config.evolutionIntervalMs },
      {
        name: 'scheduled-analysis',
        data: {
          type: 'scheduled-analysis',
          trigger: 'scheduled',
        } satisfies EvolutionJobData,
      },
    );

    // Memory maintenance — every 6 hours
    await evolutionQueue.upsertJobScheduler(
      'memory-maintenance',
      { every: config.maintenanceIntervalMs },
      {
        name: 'memory-maintenance',
        data: {
          type: 'memory-maintenance',
          trigger: 'scheduled',
        } satisfies EvolutionJobData,
      },
    );

    // Daily performance report
    await evolutionQueue.upsertJobScheduler(
      'performance-report',
      { every: 86_400_000 },
      {
        name: 'performance-report',
        data: { type: 'performance-report', trigger: 'scheduled' } satisfies EvolutionJobData,
      },
    );

    // Daily agent health check
    await evolutionQueue.upsertJobScheduler(
      'agent-health-check',
      { every: 86_400_000 },
      {
        name: 'agent-health-check',
        data: { type: 'agent-health-check', trigger: 'scheduled' } satisfies EvolutionJobData,
      },
    );

    // Analyst goal decomposition — every 4 hours
    // Enqueues one analyst job per active goal
    await evolutionQueue.upsertJobScheduler(
      'analyst-sweep',
      { every: config.analystIntervalMs },
      {
        name: 'analyst-sweep',
        data: { type: 'scheduled-analysis', trigger: 'scheduled' } satisfies EvolutionJobData,
      },
    );

    // Register a listener on the evolution queue to handle analyst sweeps
    // The evolution worker's scheduled-analysis already runs; we add a separate
    // repeatable that triggers goal analysis
    this._registerAnalystSweep(config.analystIntervalMs);
    this._registerStrategist(config.strategistIntervalMs);

    // Sync built-in schedules to DB (readable from Mission Control)
    await this._syncBuiltInSchedules(config);

    console.log('[hermes:workers] Scheduled jobs registered:');
    console.log(`  - Evolution analysis: every ${config.evolutionIntervalMs / 60000}min`);
    console.log(`  - Memory maintenance: every ${config.maintenanceIntervalMs / 60000}min`);
    console.log('  - Performance report: every 24h');
    console.log('  - Agent health check: every 24h');
    console.log(`  - Analyst sweep: every ${config.analystIntervalMs / 60000}min`);
    console.log(`  - Strategist: every ${config.strategistIntervalMs / 60000}min`);
  }

  /**
   * Sync built-in schedules to the scheduled_tasks table so Mission Control shows them.
   * These are display entries that reflect the real BullMQ repeatable jobs.
   * Uses upsert by name — creates if missing, updates interval if changed.
   */
  private async _syncBuiltInSchedules(config: ReturnType<typeof getConfig>): Promise<void> {
    const { query: dbQuery } = await import('../db');

    const builtIn = [
      {
        name: 'evolution-analysis',
        description: 'Analyze agent performance trends, detect declining agents, trigger refinements',
        intervalMin: Math.round(config.evolutionIntervalMs / 60000),
        agentName: 'hermes',
      },
      {
        name: 'memory-maintenance',
        description: 'Prune MEMORY.md, run skill acquisition sweep, curate hot memory, clean stale tasks',
        intervalMin: Math.round(config.maintenanceIntervalMs / 60000),
        agentName: 'hermes',
      },
      {
        name: 'performance-report',
        description: 'Daily report: task counts, pass rates, agent utilization across all agents',
        intervalMin: 1440,
        agentName: 'hermes',
      },
      {
        name: 'agent-health-check',
        description: 'Daily check: verify all agent .md files exist, prompt hashes match, no orphans',
        intervalMin: 1440,
        agentName: 'hermes',
      },
      {
        name: 'analyst-sweep',
        description: 'Decompose all active goals into tasks, identify gaps in acceptance criteria',
        intervalMin: Math.round(config.analystIntervalMs / 60000),
        agentName: 'analyst',
      },
      {
        name: 'strategist-assessment',
        description: 'Assess system health, propose new goals, follow up on completed goals',
        intervalMin: Math.round(config.strategistIntervalMs / 60000),
        agentName: 'strategist',
      },
    ];

    for (const sched of builtIn) {
      const cronExpr = sched.intervalMin >= 1440
        ? `0 0 */${Math.round(sched.intervalMin / 1440)} * *`
        : sched.intervalMin >= 60
          ? `0 */${Math.round(sched.intervalMin / 60)} * * *`
          : `*/${sched.intervalMin} * * * *`;

      // Upsert: insert or update existing by name
      const { v4: uuidv4 } = await import('uuid');
      await dbQuery(`
        INSERT INTO scheduled_tasks (id, name, description, cron_expression, agent_name, priority, timeout_ms, enabled)
        VALUES ($1, $2, $3, $4, $5, 5, 600000, true)
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          cron_expression = EXCLUDED.cron_expression,
          agent_name = EXCLUDED.agent_name
      `, [uuidv4(), sched.name, sched.description, cronExpr, sched.agentName]);
    }
  }

  /**
   * Schedule analyst jobs for all active goals on a repeating interval.
   */
  private _registerAnalystSweep(intervalMs: number): void {
    const sweep = async () => {
      try {
        if (!(await shouldRunBuiltInSchedule('analyst-sweep'))) {
          console.log('[hermes:workers] Analyst sweep skipped because the schedule is disabled');
          return;
        }

        const goals = await goalStore.listGoals({ status: 'active', limit: 50 });
        const analystQueue = getQueue(QUEUE_NAMES.ANALYST);

        for (const goal of goals.items) {
          await analystQueue.add('analyze', {
            goalId: goal.id,
            goalTitle: goal.title,
            goalDescription: goal.description,
            acceptanceCriteria: goal.acceptanceCriteria,
            trigger: 'scheduled',
          } satisfies AnalystJobData, { priority: 5 });
        }

        if (goals.items.length > 0) {
          console.log(`[hermes:workers] Analyst sweep: enqueued ${goals.items.length} goals`);
          // Track in scheduled_tasks for Mission Control visibility
          const { query: dbQuery } = await import('../db');
          await dbQuery(`UPDATE scheduled_tasks SET last_run_at = NOW(), run_count = run_count + 1 WHERE name = 'analyst-sweep'`).catch(() => {});
        }
      } catch (err) {
        console.error('[hermes:workers] Analyst sweep failed:', err);
      }
    };

    // Run first sweep after 10s, then on interval
    setTimeout(sweep, 10_000);
    setInterval(sweep, intervalMs);
  }

  /**
   * Run the strategist on a schedule — reviews system, creates new goals.
   */
  private _registerStrategist(intervalMs: number): void {
    const run = async () => {
      try {
        if (!(await shouldRunBuiltInSchedule('strategist-assessment'))) {
          console.log('[hermes:workers] Strategist skipped because the schedule is disabled');
          return;
        }

        const { runStrategist } = await import('./strategistWorker');
        const result = await runStrategist();
        console.log(`[hermes:workers] Strategist: "${result.assessment.slice(0, 80)}..." — ${result.goalsCreated} goals, ${result.followups} follow-ups`);
        // Track in scheduled_tasks for Mission Control visibility
        const { query: dbQuery } = await import('../db');
        await dbQuery(`UPDATE scheduled_tasks SET last_run_at = NOW(), run_count = run_count + 1 WHERE name = 'strategist-assessment'`).catch(() => {});
      } catch (err) {
        console.error('[hermes:workers] Strategist failed:', err);
      }
    };

    // First run after 30s (let everything else start first), then on interval
    setTimeout(run, 30_000);
    setInterval(run, intervalMs);
  }

  /**
   * Reload worker concurrency from database config.
   * Called after pool config changes via API.
   */
  async reloadConcurrency(): Promise<void> {
    const concurrencyMap = await workerPoolStore.getConcurrencyMap();
    const changes: string[] = [];

    for (const [queueName, worker] of this.workerMap) {
      const newConcurrency = concurrencyMap[queueName];
      if (newConcurrency !== undefined && newConcurrency !== worker.concurrency) {
        const old = worker.concurrency;
        worker.concurrency = newConcurrency;
        changes.push(`${queueName}: ${old} → ${newConcurrency}`);
      }
    }

    if (changes.length > 0) {
      console.log(`[hermes:workers] Concurrency reloaded: ${changes.join(', ')}`);
      publish({ type: 'session', action: 'updated', data: { type: 'concurrency-reloaded', changes } });
    } else {
      console.log('[hermes:workers] Concurrency reload: no changes');
    }
  }

  /**
   * Graceful shutdown — pause workers, wait for active jobs, kill subprocesses.
   */
  async shutdown(): Promise<void> {
    if (!this.running) return;

    console.log('[hermes:workers] Shutting down...');
    this.running = false;

    const workers = Array.from(this.workerMap.values());

    // 1. Pause all workers
    await Promise.all(workers.map(w => w.pause()));
    console.log('[hermes:workers] Workers paused');

    // 2. Wait for active jobs (30s timeout)
    const drainStart = Date.now();
    while (activeSubprocessCount() > 0 && Date.now() - drainStart < 30_000) {
      console.log(`[hermes:workers] Waiting for ${activeSubprocessCount()} active subprocesses...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 3. Kill remaining
    if (activeSubprocessCount() > 0) {
      console.log(`[hermes:workers] Force-killing ${activeSubprocessCount()} remaining subprocesses`);
      await killAllSubprocesses();
    }

    // 3b. Clean up any remaining hermes worktrees
    try {
      const config = getConfig();
      if (config.enableWorktreeIsolation) {
        const remaining = await listHermesWorktrees(config.projectRoot);
        for (const wtPath of remaining) {
          try {
            await removeWorktree(
              { worktreePath: wtPath, branchName: '', baseBranch: '', created: true },
              { deleteBranch: true },
            );
          } catch { /* best effort */ }
        }
        if (remaining.length > 0) {
          console.log(`[hermes:workers] Cleaned up ${remaining.length} worktrees during shutdown`);
        }
      }
    } catch { /* best effort */ }

    // 4. Close workers
    await Promise.all(workers.map(w => w.close()));
    this.workerMap.clear();

    // 5. Close queues and flow producer
    await closeQueues();
    await closeFlowProducer();

    console.log('[hermes:workers] Shutdown complete');
  }

  /**
   * Get worker pool status for health endpoint.
   */
  getStatus(): {
    running: boolean;
    workerCount: number;
    activeSubprocesses: number;
    workers: Array<{ name: string; running: boolean; concurrency: number }>;
  } {
    return {
      running: this.running,
      workerCount: this.workerMap.size,
      activeSubprocesses: activeSubprocessCount(),
      workers: Array.from(this.workerMap.entries()).map(([name, w]) => ({
        name,
        running: w.isRunning(),
        concurrency: w.concurrency,
      })),
    };
  }
}
