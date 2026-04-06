import { initPool, closePool } from './db';
import { runMigrations } from './migrations';
import { app } from './app';
import { getConfig } from './config';
import { initRedis, closeRedis } from './redis';
import { WorkerManager } from './workers/workerManager';

let workerManager: WorkerManager | null = null;

// Export for route access (health endpoint)
export function getWorkerManager(): WorkerManager | null {
  return workerManager;
}

async function main() {
  const config = getConfig();

  console.log('[hermes] Initializing database pool...');
  initPool();

  console.log('[hermes] Running migrations...');
  await runMigrations();

  // Sync agent .md files to database (extract skills, tools, prompt hashes)
  const { syncAgentsFromDisk } = await import('./agentSync');
  await syncAgentsFromDisk();

  console.log('[hermes] Connecting to Redis...');
  initRedis();

  const server = app.listen(config.port, async () => {
    console.log(`[hermes] Backend listening on port ${config.port}`);
    console.log(`[hermes] Dashboard: http://localhost:3333`);
    console.log(`[hermes] API: http://localhost:${config.port}/health`);

    // Start worker pool after Express is listening
    workerManager = new WorkerManager();
    await workerManager.start();
    await workerManager.registerSchedules();

    console.log('[hermes] Autonomous task queue is running');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[hermes] Received ${signal}, shutting down gracefully...`);

    if (workerManager) {
      await workerManager.shutdown();
    }

    server.close(() => {
      console.log('[hermes] HTTP server closed');
    });

    await closeRedis();
    await closePool();

    console.log('[hermes] Goodbye.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[hermes] Startup failed:', err);
  process.exit(1);
});
