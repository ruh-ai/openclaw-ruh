/**
 * Entry point — loads env, connects DB, starts HTTP server.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { startBackend } from './startup';

startBackend().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
