import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redisKeys } from '../src/redis/keys';
import { attemptPurchase } from '../src/purchases/purchase-gate';
import { PurchaseConsumer } from '../src/purchases/purchase-consumer';
import { getPurchaseStatus } from '../src/purchases/purchase-status';
import { rebuildRedisFromPostgres } from '../src/sale/rebuild-redis';
import { getSaleStatus } from '../src/sale/sale-status';
import { createTestContext, startSale } from './test-context';

const context = createTestContext();
const { db, redis } = context;

afterAll(() => context.close());

/** Simulates Redis losing everything, e.g. a crash without persistence. */
const wipeRedis = () => redis.del(...Object.values(redisKeys));

describe('sale status', () => {
  it('reports the state, stock and product from Redis', async () => {
    await startSale(context, { totalStock: 10 });
    await attemptPurchase(redis, 'alice');

    expect(await getSaleStatus(redis)).toMatchObject({
      state: 'ACTIVE',
      totalStock: 10,
      remainingStock: 9,
      product: { name: 'Test Sneakers' },
    });
  });

  it('is UPCOMING before the window opens', async () => {
    await startSale(context, {
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 120_000),
    });

    expect(await getSaleStatus(redis)).toMatchObject({ state: 'UPCOMING', remainingStock: 10 });
  });

  it('is ENDED after the window closes', async () => {
    await startSale(context, {
      startsAt: new Date(Date.now() - 120_000),
      endsAt: new Date(Date.now() - 60_000),
    });

    expect(await getSaleStatus(redis)).toMatchObject({ state: 'ENDED' });
  });

  it("reports Redis' clock as the server time, the same clock the gate uses", async () => {
    await startSale(context);

    const [seconds] = await redis.time();
    const status = await getSaleStatus(redis);

    const serverTimeMs = Date.parse(status!.serverTime);
    expect(Math.abs(serverTimeMs - Number(seconds) * 1000)).toBeLessThan(2_000);
  });

  it('is null when no sale has been set up', async () => {
    await wipeRedis();

    expect(await getSaleStatus(redis)).toBeNull();
  });
});

describe('rebuilding Redis from Postgres', () => {
  beforeEach(() => startSale(context, { totalStock: 10 }));

  it('leaves Redis alone when the sale is still there', async () => {
    expect(await rebuildRedisFromPostgres(db, redis)).toBe('REDIS_INTACT');
  });

  it('restores stock and buyers so the rules still hold after data loss', async () => {
    for (const userId of ['alice', 'bob', 'carol']) {
      await attemptPurchase(redis, userId);
    }
    await new PurchaseConsumer(redis, db, { consumerName: 'test-consumer', blockMs: 50 }).processNextBatch();

    await wipeRedis();
    expect(await rebuildRedisFromPostgres(db, redis)).toBe('REBUILT');

    expect(await getSaleStatus(redis)).toMatchObject({ state: 'ACTIVE', remainingStock: 7 });
    expect(await getPurchaseStatus(redis, db, 'alice')).toMatchObject({ status: 'CONFIRMED' });
    expect((await attemptPurchase(redis, 'alice')).outcome).toBe('ALREADY_PURCHASED');
    expect((await attemptPurchase(redis, 'dave')).outcome).toBe('ACCEPTED');
  });

  it('does nothing when Postgres has no sale either', async () => {
    await db.query('TRUNCATE purchases, sales');
    await wipeRedis();

    expect(await rebuildRedisFromPostgres(db, redis)).toBe('NO_SALE');
  });
});
