import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { boardPriorityToQueuePriority } from '../boardTaskState';
import { getQueue, QUEUE_NAMES, type IngestionJobData } from '../queues/definitions';
import * as boardTaskStore from '../stores/boardTaskStore';
import * as goalStore from '../stores/goalStore';
import * as taskStore from '../stores/taskStore';

export const boardTaskRouter = Router();

boardTaskRouter.get('/', asyncHandler(async (req, res) => {
  const { goalId, status, plannedAgent, limit, offset } = req.query;
  const result = await boardTaskStore.listBoardTasks({
    goalId: goalId as string | undefined,
    status: status as string | undefined,
    plannedAgent: plannedAgent as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

boardTaskRouter.post('/', asyncHandler(async (req, res) => {
  const { goalId, title, description, priority, plannedAgent, status, blockedReason, source } = req.body;
  if (!goalId) throw httpError(400, 'goalId is required');
  if (!title) throw httpError(400, 'title is required');

  await goalStore.getGoal(goalId);
  const result = await boardTaskStore.createBoardTask({
    goalId,
    title,
    description,
    priority,
    plannedAgent,
    status,
    blockedReason,
    source,
  });
  await goalStore.getGoalProgress(goalId);
  res.status(result.created ? 201 : 200).json(result);
}));

boardTaskRouter.get('/:id', asyncHandler(async (req, res) => {
  const task = await boardTaskStore.getBoardTask(req.params.id);
  res.json(task);
}));

boardTaskRouter.get('/:id/logs', asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const result = await taskStore.listTasks({
    boardTaskId: req.params.id,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

boardTaskRouter.patch('/:id', asyncHandler(async (req, res) => {
  const task = await boardTaskStore.updateBoardTask(req.params.id, req.body);
  await goalStore.getGoalProgress(task.goalId);
  res.json(task);
}));

boardTaskRouter.post('/:id/run', asyncHandler(async (req, res) => {
  const task = await boardTaskStore.getBoardTask(req.params.id);
  if (task.status === 'in_progress') {
    throw httpError(400, 'Board task is already in progress');
  }

  const priority = boardPriorityToQueuePriority(task.priority);
  const jobData: IngestionJobData = {
    description: task.description || task.title,
    source: 'api',
    agentName: task.plannedAgent || 'auto',
    priority,
    goalId: task.goalId,
    metadata: { boardTaskId: task.id },
  };

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', jobData, { priority });
  res.json({ triggered: true, boardTaskId: task.id, jobId: job.id });
}));
