/**
 * Entry point — loads env, connects DB, starts HTTP server.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { initPool } from './db';
import * as store from './store';
import * as conversationStore from './conversationStore';
import { app } from './app';

async function main() {
  const port = Number(process.env.PORT ?? 8000);

  await new Promise<void>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`OpenClaw backend (TypeScript/Bun) listening on port ${port}`);
      resolve();
    });
  });

  try {
    initPool();
    await store.initDb();
    await conversationStore.initDb();
    console.log('Database ready');
  } catch (err) {
    console.error('Database initialization failed — DB-dependent endpoints will error until resolved:', err);
  }
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
