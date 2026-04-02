import { Router } from 'express';
import { asyncHandler } from '../utils';
import { getQueue, QUEUE_NAMES, type EvolutionJobData } from '../queues/definitions';
import * as evolutionReportStore from '../stores/evolutionReportStore';

export const evolutionRouter = Router();

// List evolution reports
evolutionRouter.get('/reports', asyncHandler(async (req, res) => {
  const { reportType, limit } = req.query;
  const reports = await evolutionReportStore.listReports({
    reportType: reportType as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
  });
  res.json(reports);
}));

// Get a specific report
evolutionRouter.get('/reports/:id', asyncHandler(async (req, res) => {
  const report = await evolutionReportStore.getReport(req.params.id);
  res.json(report);
}));

// Manually trigger an evolution cycle
evolutionRouter.post('/trigger', asyncHandler(async (_req, res) => {
  const job = await getQueue(QUEUE_NAMES.EVOLUTION).add('manual-analysis', {
    type: 'scheduled-analysis',
    trigger: 'manual',
  } satisfies EvolutionJobData, { priority: 1 });

  res.json({ triggered: true, jobId: job.id });
}));

// Agent performance trends
evolutionRouter.get('/trends', asyncHandler(async (req, res) => {
  const days = req.query.days ? parseInt(String(req.query.days), 10) : 7;
  const trends = await evolutionReportStore.getAgentTrends(days);
  res.json(trends);
}));

// Manually trigger the strategist (system self-assessment → new goals)
evolutionRouter.post('/strategist', asyncHandler(async (_req, res) => {
  const { runStrategist } = await import('../workers/strategistWorker');
  const result = await runStrategist();
  res.json(result);
}));
