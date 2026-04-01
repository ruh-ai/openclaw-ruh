import { Queue, type QueueOptions } from 'bullmq';
import { getRedis } from '../redis';

// ── Queue Names ───────────────────────────────────────────────
export const QUEUE_NAMES = {
  INGESTION: 'hermes-ingestion',
  EXECUTION: 'hermes-execution',
  LEARNING: 'hermes-learning',
  EVOLUTION: 'hermes-evolution',
  FACTORY: 'hermes-factory',
  ANALYST: 'hermes-analyst',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Job Data Types ────────────────────────────────────────────

export interface IngestionJobData {
  description: string;
  source: string;           // 'api', 'webhook', 'cron', 'self', 'watcher', 'analyst'
  agentName?: string;       // 'auto' for automatic routing
  priority?: number;        // 1=critical, 5=normal, 10=low
  timeout?: number;         // ms, default 600000 (10min)
  goalId?: string;          // link task to a goal
  dependsOn?: string[];     // job IDs this task depends on (job chaining)
  metadata?: Record<string, unknown>;
}

export interface ExecutionJobData {
  taskLogId: string;
  queueJobId: string;
  agentName: string;
  agentPath: string;
  prompt: string;           // assembled prompt with memory context
  priority: number;
  timeout: number;
}

export interface LearningJobData {
  taskLogId: string;
  queueJobId: string;
  agentName: string;
  success: boolean;
  output: string | null;     // structured output from Claude
  error: string | null;
  durationMs: number;
  filesChanged?: string[];
  description?: string;      // original task description for quality review
  goalId?: string;
}

export interface EvolutionJobData {
  type: 'scheduled-analysis' | 'refine-agent' | 'memory-maintenance' | 'performance-report' | 'agent-health-check';
  agentName?: string;        // for refine-agent
  failureContext?: string;   // details about what failed
  trigger: 'scheduled' | 'event' | 'manual';
}

export interface FactoryJobData {
  gapDescription: string;
  recentTasks: string[];     // descriptions of tasks that revealed the gap
  trigger: 'evolution' | 'ingestion' | 'manual';
}

export interface AnalystJobData {
  goalId: string;
  goalTitle: string;
  goalDescription: string;
  acceptanceCriteria: string[];
  trigger: 'scheduled' | 'manual';
}

// ── Worker Concurrency ────────────────────────────────────────

export const WORKER_CONCURRENCY = {
  [QUEUE_NAMES.INGESTION]: 5,
  [QUEUE_NAMES.EXECUTION]: 2,
  [QUEUE_NAMES.LEARNING]: 3,
  [QUEUE_NAMES.EVOLUTION]: 1,
  [QUEUE_NAMES.FACTORY]: 1,
  [QUEUE_NAMES.ANALYST]: 1,
} as const;

// ── Retry Configuration ──────────────────────────────────────

export const RETRY_CONFIG = {
  [QUEUE_NAMES.INGESTION]: { attempts: 2, backoff: { type: 'fixed' as const, delay: 10_000 } },
  [QUEUE_NAMES.EXECUTION]: { attempts: 3, backoff: { type: 'exponential' as const, delay: 30_000 } },
  [QUEUE_NAMES.LEARNING]: { attempts: 5, backoff: { type: 'fixed' as const, delay: 5_000 } },
  [QUEUE_NAMES.EVOLUTION]: { attempts: 2, backoff: { type: 'fixed' as const, delay: 60_000 } },
  [QUEUE_NAMES.FACTORY]: { attempts: 2, backoff: { type: 'fixed' as const, delay: 60_000 } },
  [QUEUE_NAMES.ANALYST]: { attempts: 2, backoff: { type: 'fixed' as const, delay: 60_000 } },
};

// ── Priority Levels ──────────────────────────────────────────

export const PRIORITY: Record<string, number> = {
  CRITICAL: 1,    // user-submitted, urgent
  NORMAL: 5,      // scheduled, webhooks
  LOW: 10,        // self-generated, background
};

// ── Queue Instances ──────────────────────────────────────────

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    const opts: QueueOptions = { connection: getRedis() };
    queue = new Queue(name, opts);
    queues.set(name, queue);
  }
  return queue;
}

export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}
