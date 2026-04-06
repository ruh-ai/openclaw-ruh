import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { getQueue, QUEUE_NAMES, type IngestionJobData, PRIORITY } from '../queues/definitions';

export const webhookRouter = Router();

// GitHub webhook receiver
webhookRouter.post('/github', asyncHandler(async (req, res) => {
  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  if (!event) throw httpError(400, 'Missing X-GitHub-Event header');

  let description: string;
  let priority = PRIORITY.NORMAL;

  switch (event) {
    case 'push': {
      const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
      const commits = payload.commits?.length || 0;
      description = `[github:push] ${commits} commit(s) pushed to ${branch} by ${payload.pusher?.name || 'unknown'}`;
      break;
    }
    case 'pull_request': {
      const action = payload.action || 'unknown';
      const pr = payload.pull_request;
      description = `[github:pr] PR #${pr?.number} ${action}: ${pr?.title || 'unknown'}`;
      if (action === 'opened' || action === 'synchronize') {
        priority = PRIORITY.NORMAL;
      }
      break;
    }
    case 'issues': {
      const action = payload.action || 'unknown';
      const issue = payload.issue;
      description = `[github:issue] Issue #${issue?.number} ${action}: ${issue?.title || 'unknown'}`;
      priority = PRIORITY.LOW;
      break;
    }
    default:
      description = `[github:${event}] ${JSON.stringify(payload).slice(0, 200)}`;
      priority = PRIORITY.LOW;
  }

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description,
    source: 'webhook',
    priority,
    metadata: { githubEvent: event, deliveryId: req.headers['x-github-delivery'] },
  } satisfies IngestionJobData, { priority });

  res.json({ received: true, jobId: job.id, event });
}));

// Generic webhook — any JSON payload becomes a task
webhookRouter.post('/generic', asyncHandler(async (req, res) => {
  const { description, agentName, priority, metadata } = req.body;
  if (!description) throw httpError(400, 'description is required');

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description,
    source: 'webhook',
    agentName: agentName || 'auto',
    priority: priority ?? PRIORITY.NORMAL,
    metadata,
  } satisfies IngestionJobData, { priority: priority ?? PRIORITY.NORMAL });

  res.json({ received: true, jobId: job.id });
}));
