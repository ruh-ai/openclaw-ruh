import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { getQueue, QUEUE_NAMES, type IngestionJobData } from '../queues/definitions';
import { getFlowProducer } from '../queues/flows';
import * as queueJobStore from '../stores/queueJobStore';
import { addSseClient } from '../events/sseManager';
import { getWorkerManager } from '../index';
import { getAgentRunnerHealth, isAgentRunnerKind, setSelectedAgentRunner } from '../agentRunner';

export const queueRouter = Router();

// Submit a task to the queue
queueRouter.post('/tasks', asyncHandler(async (req, res) => {
  const { description, source, agentName, priority, timeout, goalId, metadata } = req.body;
  if (!description) throw httpError(400, 'description is required');

  const jobData: IngestionJobData = {
    description,
    source: source || 'api',
    agentName: agentName || 'auto',
    priority: priority ?? 5,
    timeout,
    goalId,
    metadata,
  };

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', jobData, {
    priority: priority ?? 5,
  });

  res.status(201).json({
    jobId: job.id,
    description,
    agent: agentName || 'auto',
    priority: priority ?? 5,
    status: 'queued',
  });
}));

// List queued jobs
queueRouter.get('/tasks', asyncHandler(async (req, res) => {
  const { queueName, status, agentName, source, limit, offset } = req.query;
  const result = await queueJobStore.listQueueJobs({
    queueName: queueName as string | undefined,
    status: status as string | undefined,
    agentName: agentName as string | undefined,
    source: source as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

// Get job detail
queueRouter.get('/tasks/:id', asyncHandler(async (req, res) => {
  const job = await queueJobStore.getQueueJob(req.params.id);
  res.json(job);
}));

// Cancel a queued job
queueRouter.delete('/tasks/:id', asyncHandler(async (req, res) => {
  const deleted = await queueJobStore.deleteQueueJob(req.params.id);
  if (!deleted) throw httpError(404, 'Queue job not found');
  res.json({ deleted: true });
}));

// Retry a failed job
queueRouter.post('/tasks/:id/retry', asyncHandler(async (req, res) => {
  const job = await queueJobStore.getQueueJob(req.params.id);
  if (job.status !== 'failed') throw httpError(400, 'Only failed jobs can be retried');

  // Re-submit to ingestion queue
  const newJob = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description: `[retry] ${job.prompt || 'Retry of failed task'}`,
    source: 'api',
    agentName: job.agentName || 'auto',
    priority: job.priority,
  } satisfies IngestionJobData, { priority: job.priority });

  res.json({ retryJobId: newJob.id, originalJobId: job.id });
}));

// Queue stats
queueRouter.get('/stats', asyncHandler(async (_req, res) => {
  const stats = await queueJobStore.getQueueStats();
  res.json(stats);
}));

// Queue + worker health
queueRouter.get('/health', asyncHandler(async (_req, res) => {
  const workerManager = getWorkerManager();
  const workerStatus = workerManager?.getStatus() ?? { running: false, workerCount: 0, activeSubprocesses: 0, workers: [] };

  // Check Redis connection
  let redisOk = false;
  try {
    const { getRedis } = await import('../redis');
    const redis = getRedis();
    await redis.ping();
    redisOk = true;
  } catch { /* redis down */ }

  res.json({
    redis: redisOk ? 'connected' : 'disconnected',
    workers: workerStatus,
    agentRunner: getAgentRunnerHealth(),
    timestamp: new Date().toISOString(),
  });
}));

queueRouter.patch('/runner', asyncHandler(async (req, res) => {
  const runner = req.body?.runner as string | undefined;
  if (!isAgentRunnerKind(runner)) {
    throw httpError(400, 'runner must be one of: claude, codex');
  }

  const current = getAgentRunnerHealth();
  const candidate = current.options.find((option) => option.kind === runner);
  if (!candidate) {
    throw httpError(400, `Unknown runner: ${runner}`);
  }

  if (!candidate.available) {
    throw httpError(400, candidate.error || `${runner} is not available`);
  }

  setSelectedAgentRunner(runner);

  res.json({
    selected: runner,
    agentRunner: getAgentRunnerHealth(),
  });
}));

// Pause a queue
queueRouter.post('/pause/:queue', asyncHandler(async (req, res) => {
  const queueName = `hermes-${req.params.queue}` as keyof typeof QUEUE_NAMES;
  const queue = getQueue(queueName as any);
  await queue.pause();
  res.json({ paused: true, queue: req.params.queue });
}));

// Resume a queue
queueRouter.post('/resume/:queue', asyncHandler(async (req, res) => {
  const queueName = `hermes-${req.params.queue}` as keyof typeof QUEUE_NAMES;
  const queue = getQueue(queueName as any);
  await queue.resume();
  res.json({ resumed: true, queue: req.params.queue });
}));

// Submit a chain of dependent tasks (job chaining)
// Body: { tasks: [{ description, agentName?, priority? }] }
// Tasks execute in order — each waits for the previous to complete
queueRouter.post('/chain', asyncHandler(async (req, res) => {
  const { tasks, goalId } = req.body as {
    tasks: Array<{ description: string; agentName?: string; priority?: number }>;
    goalId?: string;
  };

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    throw httpError(400, 'tasks array is required');
  }

  // Build a BullMQ flow: last task is the root, previous tasks are children
  // BullMQ FlowProducer executes children first, then parent
  // So we reverse: tasks[0] is deepest child, tasks[last] is root

  const flowProducer = getFlowProducer();

  // Build nested flow structure (children execute before parent)
  type FlowNode = {
    name: string;
    queueName: string;
    data: IngestionJobData;
    opts?: { priority?: number };
    children?: FlowNode[];
  };

  function buildChain(taskList: typeof tasks, index: number): FlowNode {
    const t = taskList[index];
    const node: FlowNode = {
      name: 'ingest',
      queueName: QUEUE_NAMES.INGESTION,
      data: {
        description: t.description,
        source: 'api',
        agentName: t.agentName || 'auto',
        priority: t.priority ?? 5,
        goalId,
      },
      opts: { priority: t.priority ?? 5 },
    };

    // If there are earlier tasks, they are children (execute first)
    if (index > 0) {
      node.children = [buildChain(taskList, index - 1)];
    }

    return node;
  }

  const flow = buildChain(tasks, tasks.length - 1);
  const result = await flowProducer.add(flow);

  res.status(201).json({
    chainId: result.job.id,
    taskCount: tasks.length,
    description: `Chain: ${tasks.map(t => t.description.slice(0, 40)).join(' → ')}`,
  });
}));

// SSE event stream
queueRouter.get('/events', (req, res) => {
  const cleanup = addSseClient(res);
  req.on('close', cleanup);
});
