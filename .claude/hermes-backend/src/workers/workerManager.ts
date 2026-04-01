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
import * as workerPoolStore from '../stores/workerPoolStore';
import * as goalStore from '../stores/goalStore';
import { publish } from '../eventBus';

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

    console.log('[hermes:workers] Scheduled jobs registered:');
    console.log(`  - Evolution analysis: every ${config.evolutionIntervalMs / 60000}min`);
    console.log(`  - Memory maintenance: every ${config.maintenanceIntervalMs / 60000}min`);
    console.log('  - Performance report: every 24h');
    console.log('  - Agent health check: every 24h');
    console.log(`  - Analyst sweep: every ${config.analystIntervalMs / 60000}min`);
  }

  /**
   * Schedule analyst jobs for all active goals on a repeating interval.
   */
  private _registerAnalystSweep(intervalMs: number): void {
    const sweep = async () => {
      try {
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
