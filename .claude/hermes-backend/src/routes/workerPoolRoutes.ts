import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import * as workerPoolStore from '../stores/workerPoolStore';
import { getWorkerManager } from '../index';
import { publish } from '../eventBus';

export const poolRouter = Router();

// List all pool configs
poolRouter.get('/', asyncHandler(async (_req, res) => {
  const configs = await workerPoolStore.listPoolConfigs();
  res.json(configs);
}));

// Update concurrency for a pool entry
poolRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { concurrency, maxConcurrency } = req.body;
  if (concurrency === undefined && maxConcurrency === undefined) {
    throw httpError(400, 'concurrency or maxConcurrency is required');
  }

  const config = await workerPoolStore.updatePoolConfig(req.params.id, {
    concurrency,
    maxConcurrency,
  });

  // Auto-reload workers with new config
  const workerManager = getWorkerManager();
  if (workerManager) {
    await workerManager.reloadConcurrency();
  }

  publish({ type: 'session', action: 'updated', data: { type: 'pool-config-changed', queueName: config.queueName, concurrency: config.concurrency } });

  res.json(config);
}));

// Trigger worker reload
poolRouter.post('/reload', asyncHandler(async (_req, res) => {
  const workerManager = getWorkerManager();
  if (!workerManager) throw httpError(503, 'Worker manager not running');

  await workerManager.reloadConcurrency();
  res.json({ reloaded: true });
}));
