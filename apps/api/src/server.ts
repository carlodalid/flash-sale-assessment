import {
  createDatabase,
  createLogger,
  createRedis,
  loadConfig,
  loadEnvFile,
  rebuildRedisFromPostgres,
  runMigrations,
} from '@flash-sale/core';
import { createApp } from './app';

const logger = createLogger('api');

loadEnvFile();
const config = loadConfig();

const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const applied = await runMigrations(db);
if (applied.length > 0) logger.info('Applied migrations', { applied });

const rebuild = await rebuildRedisFromPostgres(db, redis);
if (rebuild === 'REBUILT') logger.warn('Redis was empty; rebuilt sale state from Postgres');

const app = createApp({
  redis,
  db,
  replicaAcks: {
    minReplicaAcks: config.redisMinReplicaAcks,
    timeoutMs: config.redisReplicaAckTimeoutMs,
  },
});

const server = app.listen(config.apiPort, () => {
  logger.info(`Listening on http://localhost:${config.apiPort}`);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  server.close();
  await Promise.allSettled([redis.quit(), db.end()]);
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
