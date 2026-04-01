import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { getQueue, QUEUE_NAMES, type IngestionJobData } from '../queues/definitions';
import * as scheduledTaskStore from '../stores/scheduledTaskStore';

export const scheduleRouter = Router();

// List all scheduled tasks
scheduleRouter.get('/', asyncHandler(async (_req, res) => {
  const tasks = await scheduledTaskStore.listScheduledTasks();
  res.json(tasks);
}));

// Get a scheduled task
scheduleRouter.get('/:id', asyncHandler(async (req, res) => {
  const task = await scheduledTaskStore.getScheduledTask(req.params.id);
  res.json(task);
}));

// Create a new scheduled task
scheduleRouter.post('/', asyncHandler(async (req, res) => {
  const { name, description, cronExpression, agentName, priority, timeoutMs } = req.body;
  if (!name || !description || !cronExpression) {
    throw httpError(400, 'name, description, and cronExpression are required');
  }

  const task = await scheduledTaskStore.createScheduledTask({
    name,
    description,
    cronExpression,
    agentName,
    priority,
    timeoutMs,
  });

  // Register as BullMQ repeatable job
  await getQueue(QUEUE_NAMES.INGESTION).upsertJobScheduler(
    `schedule-${task.id}`,
    { pattern: cronExpression },
    {
      name: `scheduled-${name}`,
      data: {
        description,
        source: 'cron',
        agentName: agentName || 'auto',
        priority: priority ?? 5,
        timeout: timeoutMs,
      } satisfies IngestionJobData,
    },
  );

  res.status(201).json(task);
}));

// Update a scheduled task
scheduleRouter.patch('/:id', asyncHandler(async (req, res) => {
  const task = await scheduledTaskStore.updateScheduledTask(req.params.id, req.body);

  // Update the repeatable job if cron or enabled changed
  if (req.body.cronExpression !== undefined || req.body.enabled !== undefined) {
    if (task.enabled) {
      await getQueue(QUEUE_NAMES.INGESTION).upsertJobScheduler(
        `schedule-${task.id}`,
        { pattern: task.cronExpression },
        {
          name: `scheduled-${task.name}`,
          data: {
            description: task.description,
            source: 'cron',
            agentName: task.agentName,
            priority: task.priority,
            timeout: task.timeoutMs,
          } satisfies IngestionJobData,
        },
      );
    } else {
      // Remove the repeatable job when disabled
      await getQueue(QUEUE_NAMES.INGESTION).removeJobScheduler(`schedule-${task.id}`);
    }
  }

  res.json(task);
}));

// Delete a scheduled task
scheduleRouter.delete('/:id', asyncHandler(async (req, res) => {
  // Remove repeatable job first
  await getQueue(QUEUE_NAMES.INGESTION).removeJobScheduler(`schedule-${req.params.id}`);

  const deleted = await scheduledTaskStore.deleteScheduledTask(req.params.id);
  if (!deleted) throw httpError(404, 'Scheduled task not found');
  res.json({ deleted: true });
}));

// Manually trigger a scheduled task now
scheduleRouter.post('/:id/run', asyncHandler(async (req, res) => {
  const task = await scheduledTaskStore.getScheduledTask(req.params.id);

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description: task.description,
    source: 'cron',
    agentName: task.agentName,
    priority: task.priority,
    timeout: task.timeoutMs,
  } satisfies IngestionJobData, { priority: task.priority });

  // Update last run
  await scheduledTaskStore.updateScheduledTask(task.id, {
    lastRunAt: new Date().toISOString(),
    runCount: task.runCount + 1,
  });

  res.json({ triggered: true, jobId: job.id, scheduleName: task.name });
}));
