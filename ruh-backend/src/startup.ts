import { initPool } from './db';
import * as store from './store';
import * as conversationStore from './conversationStore';
import * as agentStore from './agentStore';
import * as auditStore from './auditStore';
import { app } from './app';
import { markBackendNotReady, markBackendReady } from './backendReadiness';

export interface StartupLogger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface StartupDependencies {
  port?: number;
  host?: string;
  logger?: StartupLogger;
  listen?: (port: number, host: string) => Promise<void>;
  initPool?: () => void;
  initStoreDb?: () => Promise<void>;
  initConversationDb?: () => Promise<void>;
  initAgentDb?: () => Promise<void>;
  initAuditDb?: () => Promise<void>;
}

function defaultListen(port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve());
    server.on('error', reject);
  });
}

export async function startBackend(deps: StartupDependencies = {}): Promise<void> {
  const port = Number(deps.port ?? process.env.PORT ?? 8000);
  const host = deps.host ?? '0.0.0.0';
  const logger = deps.logger ?? console;
  const listen = deps.listen ?? defaultListen;
  const initializePool = deps.initPool ?? initPool;
  const initializeStoreDb = deps.initStoreDb ?? store.initDb;
  const initializeConversationDb = deps.initConversationDb ?? conversationStore.initDb;
  const initializeAgentDb = deps.initAgentDb ?? agentStore.initDb;
  const initializeAuditDb = deps.initAuditDb ?? auditStore.initDb;

  markBackendNotReady();

  try {
    initializePool();
    await initializeStoreDb();
    await initializeConversationDb();
    await initializeAgentDb();
    await initializeAuditDb();
    await listen(port, host);
    markBackendReady();
    logger.log(`OpenClaw backend (TypeScript/Bun) listening on port ${port}`);
    logger.log('Database ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markBackendNotReady(`Database initialization failed: ${message}`);
    logger.error('Startup error:', error);
    throw error;
  }
}
