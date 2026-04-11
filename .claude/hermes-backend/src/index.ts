// Sentry must be imported first to capture startup errors
import './sentry';
import { initTelemetry, shutdownTelemetry } from './telemetry';
initTelemetry();
import { initPool, closePool } from './db';
import { runMigrations } from './migrations';
import { app } from './app';
import { getConfig } from './config';
import { initRedis, closeRedis } from './redis';
import { WorkerManager } from './workers/workerManager';
import { logger } from './logger';

let workerManager: WorkerManager | null = null;

// Export for route access (health endpoint)
export function getWorkerManager(): WorkerManager | null {
  return workerManager;
}

async function main() {
  const config = getConfig();

  logger.info('Initializing database pool...');
  initPool();

  logger.info('Running migrations...');
  await runMigrations();

  // Sync agent .md files to database (extract skills, tools, prompt hashes)
  const { syncAgentsFromDisk } = await import('./agentSync');
  await syncAgentsFromDisk();

  logger.info('Connecting to Redis...');
  initRedis();

  const server = app.listen(config.port, async () => {
    logger.info({ port: config.port }, 'Backend listening');
    logger.info({ dashboard: 'http://localhost:3333' }, 'Dashboard available');
    logger.info({ health: `http://localhost:${config.port}/health` }, 'API available');

    // Start worker pool after Express is listening
    workerManager = new WorkerManager();
    await workerManager.start();
    await workerManager.registerSchedules();

    logger.info('Autonomous task queue is running');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    if (workerManager) {
      await workerManager.shutdown();
    }

    server.close(() => {
      logger.info('HTTP server closed');
    });

    await closeRedis();
    await closePool();
    await shutdownTelemetry();

    logger.info('Goodbye.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
