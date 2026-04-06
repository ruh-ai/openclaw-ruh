import express from 'express';
import cors from 'cors';
import { getConfig } from './config';
import { asyncHandler, httpError } from './utils';
import * as agentStore from './stores/agentStore';
import * as memoryStore from './stores/memoryStore';
import * as taskStore from './stores/taskStore';
import * as scoreStore from './stores/scoreStore';
import * as refinementStore from './stores/refinementStore';
import * as sessionStore from './stores/sessionStore';
import { query } from './db';
import * as eventBus from './eventBus';
import { queueRouter } from './routes/queueRoutes';
import { scheduleRouter } from './routes/scheduleRoutes';
import { evolutionRouter } from './routes/evolutionRoutes';
import { webhookRouter } from './routes/webhookRoutes';
import { goalRouter } from './routes/goalRoutes';
import { poolRouter } from './routes/workerPoolRoutes';
import { boardTaskRouter } from './routes/boardTaskRoutes';
import { initSseBridge } from './events/sseManager';
import * as goalStore from './stores/goalStore';
import { getAgentRunnerHealth } from './agentRunner';

export const app = express();

const config = getConfig();
app.use(express.json({ limit: '256kb' }));
app.use(cors({ origin: config.allowedOrigins, credentials: true }));

// ── Queue, Schedule, Evolution, Webhook, Goals, Pool routes ───
app.use('/api/queue', queueRouter);
app.use('/api/schedules', scheduleRouter);
app.use('/api/evolution', evolutionRouter);
app.use('/api/queue/webhooks', webhookRouter);
app.use('/api/goals', goalRouter);
app.use('/api/pool', poolRouter);
app.use('/api/board/tasks', boardTaskRouter);

// Wire event bus → SSE broadcasting
initSseBridge();

// ── Health ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hermes-backend', timestamp: new Date().toISOString() });
});

// Deep health check — verifies all subsystems
app.get('/health/deep', asyncHandler(async (_req, res) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // PostgreSQL
  try {
    const dbResult = await query('SELECT NOW() as time, pg_database_size(current_database()) as size');
    checks.postgres = { status: 'ok', detail: `size=${Math.round(Number(dbResult.rows[0].size) / 1024)}KB` };
  } catch (e: any) {
    checks.postgres = { status: 'error', detail: e.message };
  }

  // Redis (via queue health)
  try {
    const { getQueue, QUEUE_NAMES } = await import('./queues/definitions');
    await getQueue(QUEUE_NAMES.INGESTION).getJobCounts();
    checks.redis = { status: 'ok' };
  } catch (e: any) {
    checks.redis = { status: 'error', detail: e.message };
  }

  // Workers
  const { getWorkerManager } = await import('./index');
  const wm = getWorkerManager();
  checks.workers = wm
    ? { status: 'ok', detail: `${wm.getStatus().workerCount} workers` }
    : { status: 'error', detail: 'Worker manager not initialized' };

  const runner = getAgentRunnerHealth();
  checks.agentRunner = runner.available
    ? { status: 'ok', detail: `${runner.selected}:${runner.source}:${runner.path}` }
    : { status: 'error', detail: runner.error || 'runner unavailable' };

  // Agents
  const agents = await agentStore.listAgents();
  checks.agents = { status: 'ok', detail: `${agents.length} registered, ${agents.filter(a => a.status === 'active').length} active` };

  // Memories
  const memStats = await memoryStore.getMemoryStats();
  checks.memories = { status: 'ok', detail: `${memStats.total} total` };

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
}));

// ── SSE Event Stream ─────────────────────────────────────────
app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  const unsubscribe = eventBus.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.get('/api/events/clients', (_req, res) => {
  res.json({ clients: eventBus.clientCount() });
});

// ── Dashboard Stats ─────────────────────────────────────────
app.get('/api/dashboard/stats', asyncHandler(async (_req, res) => {
  const [taskStats, memStats, agents, goalsSummary] = await Promise.all([
    taskStore.getTaskStats(),
    memoryStore.getMemoryStats(),
    agentStore.listAgents(),
    goalStore.getGoalsSummary(),
  ]);

  res.json({
    tasks: taskStats,
    memories: memStats,
    agents: {
      total: agents.length,
      active: agents.filter(a => a.status === 'active').length,
      list: agents.map(a => ({
        name: a.name,
        model: a.model,
        tasksTotal: a.tasksTotal,
        tasksPassed: a.tasksPassed,
        tasksFailed: a.tasksFailed,
        passRate: a.tasksTotal > 0 ? Math.round((a.tasksPassed / a.tasksTotal) * 100) : 0,
      })),
    },
    goals: {
      active: goalsSummary.length,
      list: goalsSummary,
    },
  });
}));

// ── Evolution Timeline ──────────────────────────────────────
app.get('/api/evolution/timeline', asyncHandler(async (req, res) => {
  const limit = parseInt(String(req.query.limit || '30'), 10);
  const result = await query(`
    SELECT id, 'task' as event_type, description as title, status as detail, delegated_to as agent, created_at
    FROM task_logs
    UNION ALL
    SELECT id, 'refinement' as event_type, change_description as title, reason as detail, agent_name as agent, created_at
    FROM refinements
    UNION ALL
    SELECT id, 'memory' as event_type, text as title, type as detail, agent, created_at
    FROM memories
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  res.json(result.rows.map(row => ({
    id: row.id,
    eventType: row.event_type,
    title: row.title,
    detail: row.detail,
    agent: row.agent,
    createdAt: row.created_at,
  })));
}));

// ── Agents CRUD ─────────────────────────────────────────────
app.get('/api/agents', asyncHandler(async (_req, res) => {
  const agents = await agentStore.listAgents();
  res.json(agents);
}));

// Sync agent .md files to database
app.post('/api/agents/sync', asyncHandler(async (_req, res) => {
  const { syncAgentsFromDisk } = await import('./agentSync');
  const result = await syncAgentsFromDisk();
  res.json(result);
}));

app.get('/api/agents/:name', asyncHandler(async (req, res) => {
  const agent = await agentStore.getAgent(req.params.name);
  res.json(agent);
}));

// Get acquired skills for an agent (from task execution)
app.get('/api/agents/:name/skills', asyncHandler(async (req, res) => {
  const { getAcquiredSkills } = await import('./skillAcquisition');
  const skills = await getAcquiredSkills(req.params.name);
  res.json({ agentName: req.params.name, acquiredSkills: skills, count: skills.length });
}));

// Trigger skill writeback for an agent
app.post('/api/agents/:name/skills/write', asyncHandler(async (req, res) => {
  const { writeSkillsToAgent } = await import('./skillAcquisition');
  const result = await writeSkillsToAgent(req.params.name);
  res.json(result);
}));

app.post('/api/agents', asyncHandler(async (req, res) => {
  const { name, description, model, filePath, promptHash } = req.body;
  if (!name) throw httpError(400, 'name is required');
  const agent = await agentStore.createAgent({ name, description, model, filePath, promptHash });
  res.status(201).json(agent);
}));

app.patch('/api/agents/:name', asyncHandler(async (req, res) => {
  const agent = await agentStore.updateAgent(req.params.name, req.body);
  res.json(agent);
}));

app.delete('/api/agents/:name', asyncHandler(async (req, res) => {
  const deleted = await agentStore.deleteAgent(req.params.name);
  if (!deleted) throw httpError(404, 'Agent not found');
  res.json({ deleted: true });
}));

// ── Memories CRUD ───────────────────────────────────────────
app.get('/api/memories', asyncHandler(async (req, res) => {
  const { type, agent, limit, offset } = req.query;
  const result = await memoryStore.listMemories({
    type: type as string | undefined,
    agent: agent as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

app.post('/api/memories', asyncHandler(async (req, res) => {
  const { text, type, agent, tags, taskContext, vectorId } = req.body;
  if (!text || !type) throw httpError(400, 'text and type are required');
  const memory = await memoryStore.createMemory({ text, type, agent, tags, taskContext, vectorId });
  eventBus.publish({ type: 'memory', action: 'created', data: memory });
  res.status(201).json(memory);
}));

app.get('/api/memories/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) throw httpError(400, 'q is required');
  const results = await memoryStore.searchMemories({
    q,
    type: req.query.type as string | undefined,
    agent: req.query.agent as string | undefined,
    limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
  });
  res.json(results);
}));

app.get('/api/memories/stats', asyncHandler(async (_req, res) => {
  const stats = await memoryStore.getMemoryStats();
  res.json(stats);
}));

// ── Tasks CRUD ──────────────────────────────────────────────
app.get('/api/tasks', asyncHandler(async (req, res) => {
  const { status, delegatedTo, sessionId, goalId, boardTaskId, limit, offset } = req.query;
  const result = await taskStore.listTasks({
    status: status as string | undefined,
    delegatedTo: delegatedTo as string | undefined,
    sessionId: sessionId as string | undefined,
    goalId: goalId as string | undefined,
    boardTaskId: boardTaskId as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
    offset: offset ? parseInt(String(offset), 10) : undefined,
  });
  res.json(result);
}));

app.post('/api/tasks', asyncHandler(async (req, res) => {
  const { description, delegatedTo, sessionId, parentTaskId, priority } = req.body;
  if (!description) throw httpError(400, 'description is required');
  const task = await taskStore.createTask({ description, delegatedTo, sessionId, parentTaskId, priority });
  eventBus.publish({ type: 'task', action: 'created', data: task });
  res.status(201).json(task);
}));

app.patch('/api/tasks/:id', asyncHandler(async (req, res) => {
  const task = await taskStore.updateTask(req.params.id, req.body);
  eventBus.publish({ type: 'task', action: 'updated', data: task });
  res.json(task);
}));

app.get('/api/tasks/:id/tree', asyncHandler(async (req, res) => {
  const tree = await taskStore.getTaskTree(req.params.id);
  res.json(tree);
}));

// ── Scores CRUD ─────────────────────────────────────────────
app.get('/api/scores', asyncHandler(async (req, res) => {
  const { agentName, limit } = req.query;
  const scores = await scoreStore.listScores({
    agentName: agentName as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
  });
  res.json(scores);
}));

app.post('/api/scores', asyncHandler(async (req, res) => {
  const { agentName, taskId, passed, score, notes } = req.body;
  if (!agentName || passed === undefined) throw httpError(400, 'agentName and passed are required');
  const result = await scoreStore.createScore({ agentName, taskId, passed, score, notes });
  // Also update the agent's aggregate score
  await agentStore.incrementAgentScore(agentName, passed);
  eventBus.publish({ type: 'score', action: 'created', data: result });
  res.status(201).json(result);
}));

// ── Refinements CRUD ────────────────────────────────────────
app.get('/api/refinements', asyncHandler(async (req, res) => {
  const { agentName, limit } = req.query;
  const refinements = await refinementStore.listRefinements({
    agentName: agentName as string | undefined,
    limit: limit ? parseInt(String(limit), 10) : undefined,
  });
  res.json(refinements);
}));

app.post('/api/refinements', asyncHandler(async (req, res) => {
  const { agentName, changeDescription, reason, diffSummary } = req.body;
  if (!agentName || !changeDescription) throw httpError(400, 'agentName and changeDescription are required');
  const ref = await refinementStore.createRefinement({ agentName, changeDescription, reason, diffSummary });
  eventBus.publish({ type: 'refinement', action: 'created', data: ref });
  res.status(201).json(ref);
}));

// ── Sessions CRUD ───────────────────────────────────────────
app.get('/api/sessions', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
  const sessions = await sessionStore.listSessions(limit);
  res.json(sessions);
}));

app.post('/api/sessions', asyncHandler(async (_req, res) => {
  const session = await sessionStore.createSession();
  eventBus.publish({ type: 'session', action: 'created', data: session });
  res.status(201).json(session);
}));

app.get('/api/sessions/:id', asyncHandler(async (req, res) => {
  const detail = await sessionStore.getSessionDetail(req.params.id);
  res.json(detail);
}));

app.patch('/api/sessions/:id', asyncHandler(async (req, res) => {
  const session = await sessionStore.updateSession(req.params.id, req.body);
  eventBus.publish({ type: 'session', action: 'updated', data: session });
  res.json(session);
}));

// ── Error middleware (must be last) ─────────────────────────
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) {
    console.error(`[hermes] Error: ${err.message}`, err.stack);
    res.status(status).json({ error: 'Internal server error' });
  } else {
    res.status(status).json({ error: err.message });
  }
});
