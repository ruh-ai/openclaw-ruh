import Redis from 'ioredis';
import { getConfig } from './config';

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (!connection) throw new Error('Redis not initialized — call initRedis() first');
  return connection;
}

export function initRedis(): Redis {
  const config = getConfig();
  connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    console.error('[hermes] Redis error:', err.message);
  });

  connection.on('connect', () => {
    console.log('[hermes] Redis connected');
  });

  return connection;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
