/**
 * Entry point — loads env, connects DB, starts HTTP server.
 *
 * @kb: 002-backend-overview 001-architecture
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { startBackend } from './startup';
import { shutdownTelemetry } from './telemetry';

process.on('SIGTERM', async () => {
  await shutdownTelemetry();
  process.exit(0);
});

startBackend().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
