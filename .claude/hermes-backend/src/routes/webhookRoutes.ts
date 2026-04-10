import crypto from 'crypto';
import { Router } from 'express';
import { asyncHandler, httpError } from '../utils';
import { getQueue, QUEUE_NAMES, type IngestionJobData, PRIORITY } from '../queues/definitions';

export const webhookRouter = Router();

function verifyLinearSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

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

// Linear webhook receiver
webhookRouter.post('/linear', asyncHandler(async (req, res) => {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) throw httpError(500, 'LINEAR_WEBHOOK_SECRET not configured');

  const signature = req.headers['linear-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!signature || !rawBody || !verifyLinearSignature(rawBody, signature, secret)) {
    throw httpError(401, 'Invalid Linear webhook signature');
  }

  const { action, type, data, updatedFrom } = req.body;
  if (!type || !action) throw httpError(400, 'Missing type or action in Linear payload');

  let description: string;
  let priority = PRIORITY.NORMAL;
  let agentName: string = 'auto';

  switch (type) {
    case 'Issue': {
      const title = data?.title || 'untitled';
      const stateName = data?.state?.name || 'unknown';
      const stateType = data?.state?.type || '';

      if (action === 'create') {
        description = `[linear:issue:created] ${title}`;
      } else if (action === 'update' && updatedFrom?.stateId) {
        description = `[linear:issue:status-change] ${title} → ${stateName}`;
        // Only enqueue when moved to a started state (In Progress, etc.)
        if (stateType !== 'started' && stateType !== 'unstarted') {
          res.json({ received: true, skipped: true, reason: `status type ${stateType} not actionable` });
          return;
        }
      } else if (action === 'update') {
        description = `[linear:issue:updated] ${title}`;
        priority = PRIORITY.LOW;
      } else {
        description = `[linear:issue:${action}] ${title}`;
        priority = PRIORITY.LOW;
      }

      // Route by priority
      const linearPriority = data?.priority;
      if (linearPriority === 1) priority = PRIORITY.CRITICAL;
      else if (linearPriority === 2) priority = PRIORITY.NORMAL;

      // Route by labels if available
      const labels: string[] = (data?.labels || []).map((l: any) => l?.name?.toLowerCase()).filter(Boolean);
      if (labels.includes('backend')) agentName = 'backend';
      else if (labels.includes('frontend')) agentName = 'frontend';
      else if (labels.includes('flutter') || labels.includes('mobile')) agentName = 'flutter';
      else if (labels.includes('test') || labels.includes('testing')) agentName = 'test';
      else if (labels.includes('sandbox') || labels.includes('docker')) agentName = 'sandbox';

      break;
    }
    case 'Comment': {
      const body = (data?.body || '').slice(0, 200);
      description = `[linear:comment:${action}] ${body}`;
      priority = PRIORITY.LOW;
      break;
    }
    default: {
      description = `[linear:${type}:${action}] ${JSON.stringify(data).slice(0, 200)}`;
      priority = PRIORITY.LOW;
    }
  }

  const job = await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description,
    source: 'webhook',
    agentName,
    priority,
    metadata: {
      linearEvent: type,
      linearAction: action,
      linearId: data?.id,
      linearUrl: data?.url,
      linearTeamId: data?.teamId,
      linearPriority: data?.priority,
      linearDeliveryId: req.headers['linear-delivery'],
    },
  } satisfies IngestionJobData, { priority });

  res.json({ received: true, jobId: job.id, event: `${type}:${action}` });
}));
