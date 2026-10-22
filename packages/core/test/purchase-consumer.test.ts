import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findPurchasesForSale } from '../src/db/purchase-repository';
import { PURCHASE_CONSUMER_GROUP, redisKeys } from '../src/redis/keys';
import { attemptPurchase } from '../src/purchases/purchase-gate';
import { PurchaseConsumer, type PurchaseConsumerOptions } from '../src/purchases/purchase-consumer';
import { parsePurchaseRecord } from '../src/purchases/purchase-record';
import { parseStreamEntries, type RawStreamEntry } from '../src/purchases/purchase-stream';
import type { Sale } from '../src/sale/sale';
import { createTestContext, startSale } from './test-context';

const context = createTestContext();
const { db, redis } = context;

afterAll(() => context.close());

function createConsumer(options: Partial<PurchaseConsumerOptions> = {}) {
  return new PurchaseConsumer(redis, db, {
    consumerName: 'test-consumer',
    blockMs: 50,
    retryDelayMs: 0,
    ...options,
  });
}

async function statusOf(userId: string) {
  const stored = await redis.hget(redisKeys.purchases, userId);
  return stored ? parsePurchaseRecord(stored).status : undefined;
}

async function queuedMessages() {
  const entries = (await redis.xrange(redisKeys.purchaseStream, '-', '+')) as RawStreamEntry[];
  return parseStreamEntries(entries);
}

async function unacknowledgedCount() {
  const [count] = (await redis.xpending(redisKeys.purchaseStream, PURCHASE_CONSUMER_GROUP)) as [number];
  return count;
}

describe('purchase consumer', () => {
  let sale: Sale;

  beforeEach(async () => {
    sale = await startSale(context, { totalStock: 10 });
  });

  it('persists accepted purchases and marks them CONFIRMED', async () => {
    for (const userId of ['alice', 'bob', 'carol']) {
      await attemptPurchase(redis, userId);
    }

    expect(await createConsumer().processNextBatch()).toBe(3);

    const rows = await findPurchasesForSale(db, sale.id);
    expect(rows.map((row) => [row.userId, row.status])).toEqual([
      ['alice', 'CONFIRMED'],
      ['bob', 'CONFIRMED'],
      ['carol', 'CONFIRMED'],
    ]);
    expect(await statusOf('alice')).toBe('CONFIRMED');
    expect(await unacknowledgedCount()).toBe(0);
  });

  it('is idempotent when the same message is delivered twice', async () => {
    await attemptPurchase(redis, 'alice');
    const [message] = await queuedMessages();
    const consumer = createConsumer();

    expect(await consumer.settle(message!)).toBe('CONFIRMED');
    expect(await consumer.settle(message!)).toBe('CONFIRMED');

    const rows = await findPurchasesForSale(db, sale.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'alice', status: 'CONFIRMED' });
  });

  it('takes over messages abandoned by a crashed worker', async () => {
    await attemptPurchase(redis, 'alice');
    // A worker reads the message, then dies before acknowledging it.
    await redis.xreadgroup('GROUP', PURCHASE_CONSUMER_GROUP, 'crashed-worker', 'STREAMS', redisKeys.purchaseStream, '>');
    expect(await unacknowledgedCount()).toBe(1);

    await createConsumer({ consumerName: 'healthy-worker', reclaimIdleMs: 0 }).processNextBatch();

    expect(await statusOf('alice')).toBe('CONFIRMED');
    expect(await unacknowledgedCount()).toBe(0);
  });

  describe('when persisting keeps failing', () => {
    const failingConsumer = () =>
      createConsumer({
        maxAttempts: 3,
        persistPurchase: async () => {
          throw new Error('database unavailable');
        },
      });

    it('dead-letters the purchase, marks it FAILED and returns the unit to stock', async () => {
      await attemptPurchase(redis, 'alice');
      expect(await redis.get(redisKeys.stock)).toBe('9');

      const [message] = await queuedMessages();
      expect(await failingConsumer().settle(message!)).toBe('DEAD_LETTERED');

      expect(await statusOf('alice')).toBe('FAILED');
      expect(await redis.get(redisKeys.stock)).toBe('10');
      expect(await redis.xlen(redisKeys.deadLetterStream)).toBe(1);
    });

    it('acknowledges the message so it is not redelivered', async () => {
      await attemptPurchase(redis, 'alice');

      await failingConsumer().processNextBatch();

      expect(await unacknowledgedCount()).toBe(0);
    });
  });

  it('drops a message from a previous sale without touching the new sale', async () => {
    await attemptPurchase(redis, 'alice');
    const [staleMessage] = await queuedMessages();

    await startSale(context, { totalStock: 5 });
    const outcome = await createConsumer({ maxAttempts: 2 }).settle(staleMessage!);

    expect(outcome).toBe('STALE');
    expect(await redis.get(redisKeys.stock)).toBe('5');
    expect(await statusOf('alice')).toBeUndefined();
    expect(await redis.xlen(redisKeys.deadLetterStream)).toBe(0);
  });
});
