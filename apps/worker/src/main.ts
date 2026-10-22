import { hostname } from 'node:os';
import {
  createDatabase,
  createLogger,
  createRedis,
  loadConfig,
  loadEnvFile,
  PurchaseConsumer,
} from '@flash-sale/core';

const logger = createLogger('worker');

loadEnvFile();
const config = loadConfig();

const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const consumer = new PurchaseConsumer(redis, db, {
  consumerName: `${hostname()}-${process.pid}`,
});

const stop = new AbortController();

function shutdown(signal: string) {
  logger.info(`Received ${signal}, finishing current batch`);
  stop.abort();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

await consumer.run(stop.signal);
await Promise.allSettled([redis.quit(), db.end()]);
logger.info('Stopped');
