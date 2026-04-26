import path from 'path';
import { getSelectedAgentRunner, type AgentRunnerKind } from './agentRunner';

export interface HermesConfig {
  databaseUrl: string;
  port: number;
  allowedOrigins: string[];
  // Queue + Worker config
  redisUrl: string;
  workerConcurrency: number;      // max concurrent execution workers
  executionTimeout: number;       // default timeout per job (ms)
  maxSubprocesses: number;        // hard cap on Claude CLI subprocesses
  evolutionIntervalMs: number;    // evolution analysis schedule
  maintenanceIntervalMs: number;  // memory maintenance schedule
  analystIntervalMs: number;      // analyst goal sweep schedule
  strategistIntervalMs: number;   // strategist self-assessment schedule
  projectRoot: string;            // cwd for agent subprocesses
  agentsDir: string;              // path to .claude/agents/
  enableWorktreeIsolation: boolean; // per-job git worktree isolation
  defaultAgentRunner: AgentRunnerKind;
}

export function getConfig(): HermesConfig {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://openclaw:changeme@localhost:5432/hermes';
  const port = parseInt(process.env.PORT || '8100', 10);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3333').split(',').map(s => s.trim());
  const selectedRunner = getSelectedAgentRunner().kind;

  // Resolve project root: walk up from hermes-backend to repo root
  const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../..');
  const agentsDir = process.env.AGENTS_DIR || path.join(projectRoot, '.claude', 'agents');

  return Object.freeze({
    databaseUrl,
    port,
    allowedOrigins,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    executionTimeout: parseInt(process.env.EXECUTION_TIMEOUT_MS || '600000', 10),
    maxSubprocesses: parseInt(process.env.MAX_SUBPROCESSES || '3', 10),
    evolutionIntervalMs: parseInt(process.env.EVOLUTION_INTERVAL_MS || '7200000', 10),   // 2h
    maintenanceIntervalMs: parseInt(process.env.MAINTENANCE_INTERVAL_MS || '21600000', 10), // 6h
    analystIntervalMs: parseInt(process.env.ANALYST_INTERVAL_MS || '14400000', 10),         // 4h
    strategistIntervalMs: parseInt(process.env.STRATEGIST_INTERVAL_MS || '28800000', 10),   // 8h
    projectRoot,
    agentsDir,
    enableWorktreeIsolation: process.env.HERMES_WORKTREE_ISOLATION !== 'false',
    defaultAgentRunner: selectedRunner,
  });
}
