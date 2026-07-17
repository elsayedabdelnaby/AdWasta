import { loadConfig } from './config/env.js';
import { createDb } from './db/client.js';
import { buildApp } from './api/app.js';
import { createArmQueue, createRedis } from './queue/jobs.js';
import { startArmWorker } from './queue/workers.js';

// Load .env when present (Node 22 built-in); platforms may inject env directly.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file — rely on the process environment */
}

const config = loadConfig();
const db = createDb(config);
const redis = createRedis(config.REDIS_URL);
const queue = createArmQueue(config.REDIS_URL);
const worker = startArmWorker(db, config.REDIS_URL);

const app = await buildApp({
  config,
  db,
  redis,
  jobQueue: queue,
  rateLimit: { max: 300, timeWindow: '1 minute' },
});

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received — shutting down`);
  await app.close();
  await worker.close();
  await queue.close();
  await redis.quit();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
