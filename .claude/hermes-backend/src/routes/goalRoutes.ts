import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { getQueue, QUEUE_NAMES, type AnalystJobData } from '../queues/definitions';
import * as goalStore from '../stores/goalStore';
import * as taskStore from '../stores/taskStore';
import * as boardTaskStore from '../stores/boardTaskStore';

export const goalRouter = Router();

function buildGoalLane(goal: goalStore.Goal, tasks: boardTaskStore.BoardTask[]) {
  const stats = {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    done: tasks.filter((task) => task.status === 'done').length,
  };

  return {
    goal,
    stats,
    tasks,
  };
}

// List goals
goalRouter.get('/', asyncHandler(async (req, res) => {
  const { status, priority, limit, offset } = req.query;
  const result = await goalStore.listGoals({
    status: status as string | undefined,
    priority: priority as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

goalRouter.get('/board', asyncHandler(async (req, res) => {
  const { status, priority, limit, offset } = req.query;
  const goals = await goalStore.listGoals({
    status: status as string | undefined,
    priority: priority as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });

  const goalIds = goals.items.map((goal) => goal.id);
  const boardTasks = goalIds.length > 0
    ? await boardTaskStore.listBoardTasks({ goalIds, limit: 1000 })
    : { items: [], total: 0 };

  const items = goals.items.map((goal) => buildGoalLane(
    goal,
    boardTasks.items.filter((task) => task.goalId === goal.id),
  ));

  res.json({ items, totalGoals: goals.total, totalTasks: boardTasks.total });
}));

// Create goal
goalRouter.post('/', asyncHandler(async (req, res) => {
  const { title, description, priority, deadline, acceptanceCriteria } = req.body;
  if (!title || !description) throw httpError(400, 'title and description are required');

  const goal = await goalStore.createGoal({
    title,
    description,
    priority,
    deadline,
    acceptanceCriteria,
  });
  res.status(201).json(goal);
}));

goalRouter.get('/:id/board', asyncHandler(async (req, res) => {
  const goal = await goalStore.getGoal(req.params.id);
  const tasks = await boardTaskStore.listBoardTasks({ goalId: goal.id, limit: 500 });
  res.json(buildGoalLane(goal, tasks.items));
}));

// Get goal detail
goalRouter.get('/:id', asyncHandler(async (req, res) => {
  const goal = await goalStore.getGoal(req.params.id);
  res.json(goal);
}));

// Update goal
goalRouter.patch('/:id', asyncHandler(async (req, res) => {
  const goal = await goalStore.updateGoal(req.params.id, req.body);
  res.json(goal);
}));

// Delete goal
goalRouter.delete('/:id', asyncHandler(async (req, res) => {
  const deleted = await goalStore.deleteGoal(req.params.id);
  if (!deleted) throw httpError(404, 'Goal not found');
  res.json({ deleted: true });
}));

// Get goal progress (task breakdown)
goalRouter.get('/:id/progress', asyncHandler(async (req, res) => {
  const progress = await goalStore.getGoalProgress(req.params.id);
  res.json(progress);
}));

// List tasks linked to this goal
goalRouter.get('/:id/tasks', asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const result = await taskStore.listTasks({
    goalId: req.params.id,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

// Trigger analyst for a specific goal
goalRouter.post('/:id/analyze', asyncHandler(async (req, res) => {
  const goal = await goalStore.getGoal(req.params.id);
  if (goal.status !== 'active') throw httpError(400, 'Can only analyze active goals');

  const job = await getQueue(QUEUE_NAMES.ANALYST).add('analyze', {
    goalId: goal.id,
    goalTitle: goal.title,
    goalDescription: goal.description,
    acceptanceCriteria: goal.acceptanceCriteria,
    trigger: 'manual',
  } satisfies AnalystJobData, { priority: 1 });

  res.json({ triggered: true, jobId: job.id, goalId: goal.id });
}));
