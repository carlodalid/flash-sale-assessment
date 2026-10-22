import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redisKeys } from '../src/redis/keys';
import { attemptPurchase } from '../src/purchases/purchase-gate';
import { PurchaseConsumer } from '../src/purchases/purchase-consumer';
import { getPurchaseStatus } from '../src/purchases/purchase-status';
import { createTestContext, startSale } from './test-context';

const context = createTestContext();
const { db, redis } = context;

afterAll(() => context.close());

const statusOf = (userId: string) => getPurchaseStatus(redis, db, userId);
const runWorkerOnce = () =>
  new PurchaseConsumer(redis, db, { consumerName: 'test-consumer', blockMs: 50 }).processNextBatch();

describe('purchase status', () => {
  beforeEach(() => startSale(context));

  it('is NOT_FOUND for someone who has not bought', async () => {
    expect(await statusOf('nobody')).toEqual({ userId: 'nobody', status: 'NOT_FOUND' });
  });

  it('is PENDING between acceptance and persistence', async () => {
    await attemptPurchase(redis, 'alice');

    expect(await statusOf('alice')).toMatchObject({ userId: 'alice', status: 'PENDING' });
  });

  it('is CONFIRMED once the worker has persisted the purchase', async () => {
    const attempt = await attemptPurchase(redis, 'alice');
    await runWorkerOnce();

    expect(await statusOf('alice')).toMatchObject({
      status: 'CONFIRMED',
      purchaseId: attempt.outcome === 'ACCEPTED' ? attempt.purchase.purchaseId : undefined,
    });
  });

  it('falls back to Postgres when Redis no longer has the purchase', async () => {
    await attemptPurchase(redis, 'alice');
    await runWorkerOnce();
    await redis.hdel(redisKeys.purchases, 'alice');

    expect(await statusOf('alice')).toMatchObject({ userId: 'alice', status: 'CONFIRMED' });
  });
});
