import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRedis, type Redis } from '../src/redis/client';
import { redisKeys } from '../src/redis/keys';
import { attemptPurchase } from '../src/purchases/purchase-gate';
import { parsePurchaseRecord } from '../src/purchases/purchase-record';
import { createTestContext, startSale, TEST_REDIS_URL } from './test-context';

const context = createTestContext();
const { redis } = context;

afterAll(() => context.close());

const remainingStock = async () => Number(await redis.get(redisKeys.stock));
const queuedMessages = () => redis.xlen(redisKeys.purchaseStream);

describe('purchase gate', () => {
  beforeEach(() => startSale(context, { totalStock: 10 }));

  it('accepts a purchase: claims a unit, records it as PENDING and queues it', async () => {
    const attempt = await attemptPurchase(redis, 'alice');

    expect(attempt.outcome).toBe('ACCEPTED');
    expect(await remainingStock()).toBe(9);
    expect(await queuedMessages()).toBe(1);

    const stored = await redis.hget(redisKeys.purchases, 'alice');
    expect(parsePurchaseRecord(stored!)).toMatchObject({ status: 'PENDING' });
  });

  it('allows only one purchase per user', async () => {
    await attemptPurchase(redis, 'alice');
    const second = await attemptPurchase(redis, 'alice');

    expect(second.outcome).toBe('ALREADY_PURCHASED');
    expect(await remainingStock()).toBe(9);
    expect(await queuedMessages()).toBe(1);
  });

  it('rejects buyers once stock runs out', async () => {
    await startSale(context, { totalStock: 1 });

    expect((await attemptPurchase(redis, 'alice')).outcome).toBe('ACCEPTED');
    expect((await attemptPurchase(redis, 'bob')).outcome).toBe('SOLD_OUT');
    expect(await remainingStock()).toBe(0);
  });

  it('tells a returning buyer they already purchased, even after a sell-out', async () => {
    await startSale(context, { totalStock: 1 });
    await attemptPurchase(redis, 'alice');

    expect((await attemptPurchase(redis, 'alice')).outcome).toBe('ALREADY_PURCHASED');
  });

  describe('sale window', () => {
    it('rejects purchases before the sale starts', async () => {
      await startSale(context, {
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
      });

      expect((await attemptPurchase(redis, 'alice')).outcome).toBe('SALE_NOT_ACTIVE');
      expect(await remainingStock()).toBe(10);
    });

    it('rejects purchases after the sale ends', async () => {
      await startSale(context, {
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000),
      });

      expect((await attemptPurchase(redis, 'alice')).outcome).toBe('SALE_NOT_ACTIVE');
      expect(await remainingStock()).toBe(10);
    });

    it('rejects purchases when no sale is set up', async () => {
      await redis.del(redisKeys.sale);

      expect((await attemptPurchase(redis, 'alice')).outcome).toBe('SALE_NOT_ACTIVE');
    });
  });

  describe('under concurrency', () => {
    // Several connections, so requests genuinely interleave as they would from
    // multiple API instances.
    const connections: Redis[] = Array.from({ length: 10 }, () => createRedis(TEST_REDIS_URL));
    afterAll(() => Promise.all(connections.map((connection) => connection.quit())));

    const connectionFor = (i: number) => connections[i % connections.length]!;

    it('sells exactly the available stock when 500 buyers race for 10 units', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 500 }, (_, i) => attemptPurchase(connectionFor(i), `buyer-${i}`)),
      );

      const accepted = attempts.filter((attempt) => attempt.outcome === 'ACCEPTED');
      const soldOut = attempts.filter((attempt) => attempt.outcome === 'SOLD_OUT');

      expect(accepted).toHaveLength(10);
      expect(soldOut).toHaveLength(490);
      expect(await remainingStock()).toBe(0);
      expect(await queuedMessages()).toBe(10);
      expect(await redis.hlen(redisKeys.purchases)).toBe(10);
    });

    it('accepts only one of many simultaneous clicks from the same user', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 50 }, (_, i) => attemptPurchase(connectionFor(i), 'eager-clicker')),
      );

      const outcomes = attempts.map((attempt) => attempt.outcome);
      expect(outcomes.filter((outcome) => outcome === 'ACCEPTED')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome === 'ALREADY_PURCHASED')).toHaveLength(49);
      expect(await remainingStock()).toBe(9);
    });
  });
});
