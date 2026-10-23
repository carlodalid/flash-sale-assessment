/**
 * End-to-end stress test: resets the sale, fires a k6 burst at the running API,
 * waits for the worker to drain the queue, then checks that the end state is
 * exactly right. Correctness is what matters here; k6 reports the latencies.
 *
 * Requires Postgres/Redis (`pnpm infra:up`) and the API + worker (`pnpm dev`).
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  createDatabase,
  createRedis,
  loadConfig,
  loadEnvFile,
  PURCHASE_CONSUMER_GROUP,
  redisKeys,
  setupSale,
  type Database,
  type Redis,
} from '@flash-sale/core';
import { floorToMinute } from '@flash-sale/shared';

const STOCK = 100;
const DRAIN_TIMEOUT_MS = 30_000;

interface Check {
  name: string;
  expected: number;
  actual: number;
}

loadEnvFile();
const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);

try {
  await assertApiIsRunning(`http://localhost:${config.apiPort}/healthz`);

  // Whole minutes like every authored sale; rounding down means it's live straight away.
  const startsAt = floorToMinute(new Date());
  await setupSale(db, redis, {
    product: { name: 'Stress Test Sneakers', imageUrl: '/product.svg', priceCents: 12_900 },
    totalStock: STOCK,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 10 * 60_000),
  });
  console.log(`Sale reset with ${STOCK} units. Starting k6...\n`);

  const k6 = spawnSync(
    'docker',
    ['compose', '--profile', 'stress', 'run', '--rm', 'k6', 'run', '/stress/purchase-burst.js'],
    { stdio: 'inherit' },
  );
  if (k6.status !== 0) {
    console.warn(`\nk6 exited with code ${k6.status} (a threshold may have been crossed). Verifying anyway.`);
  }

  console.log('\nWaiting for the worker to drain the purchase stream...');
  await waitForQueueToDrain(redis);

  const checks = await verifyEndState(db, redis);
  console.table(checks.map((c) => ({ ...c, result: c.actual === c.expected ? 'PASS' : 'FAIL' })));

  const passed = checks.every((c) => c.actual === c.expected);
  console.log(passed ? 'All correctness checks passed.' : 'Correctness checks FAILED.');
  process.exitCode = passed ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([redis.quit(), db.end()]);
}

async function assertApiIsRunning(healthUrl: string): Promise<void> {
  try {
    const response = await fetch(healthUrl);
    if (response.ok) return;
  } catch {
    // Fall through to the error below.
  }
  throw new Error(`API is not healthy at ${healthUrl}. Start it with \`pnpm dev\` first.`);
}

/** Done when every queued message has been delivered (lag 0) and acknowledged (pending 0). */
async function waitForQueueToDrain(redis: Redis): Promise<void> {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const group = await readConsumerGroup(redis);
    if (group.lag === 0 && group.pending === 0) return;
    await sleep(250);
  }
  throw new Error(`The purchase stream did not drain within ${DRAIN_TIMEOUT_MS / 1000}s. Is the worker running?`);
}

async function readConsumerGroup(redis: Redis): Promise<{ pending: number; lag: number }> {
  const groups = (await redis.xinfo('GROUPS', redisKeys.purchaseStream)) as Array<Array<string | number>>;

  for (const fields of groups) {
    const info = new Map<string, string | number>();
    for (let i = 0; i < fields.length; i += 2) info.set(String(fields[i]), fields[i + 1]!);

    if (info.get('name') === PURCHASE_CONSUMER_GROUP) {
      return { pending: Number(info.get('pending')), lag: Number(info.get('lag')) };
    }
  }
  throw new Error(`Consumer group ${PURCHASE_CONSUMER_GROUP} does not exist.`);
}

async function verifyEndState(db: Database, redis: Redis): Promise<Check[]> {
  const { rows } = await db.query<{ confirmed: number; failed: number; duplicate_users: number }>(`
    SELECT
      count(*) FILTER (WHERE status = 'CONFIRMED')::int                  AS confirmed,
      count(*) FILTER (WHERE status = 'FAILED')::int                     AS failed,
      (count(*) - count(DISTINCT (sale_id, user_id)))::int               AS duplicate_users
    FROM purchases
  `);
  const counts = rows[0]!;

  const [stock, deadLetters, redisRecords] = await Promise.all([
    redis.get(redisKeys.stock),
    redis.xlen(redisKeys.deadLetterStream),
    redis.hvals(redisKeys.purchases),
  ]);
  const redisConfirmed = redisRecords.filter((json) => JSON.parse(json).status === 'CONFIRMED').length;

  return [
    { name: 'Confirmed purchases in Postgres', expected: STOCK, actual: counts.confirmed },
    { name: 'Confirmed purchases in Redis', expected: STOCK, actual: redisConfirmed },
    { name: 'Failed purchases in Postgres', expected: 0, actual: counts.failed },
    { name: 'Users with more than one purchase', expected: 0, actual: counts.duplicate_users },
    { name: 'Remaining stock in Redis', expected: 0, actual: Number(stock) },
    { name: 'Dead-lettered messages', expected: 0, actual: deadLetters },
  ];
}
