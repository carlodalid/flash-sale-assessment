import type { Redis } from 'ioredis';
import type { Database } from '../db/pool';
import { findPurchasesForSale } from '../db/purchase-repository';
import { findLatestSale } from '../db/sale-repository';
import { serializePurchaseRecord } from '../purchases/purchase-record';
import { ensurePurchaseConsumerGroup } from '../purchases/purchase-stream';
import { redisKeys } from '../redis/keys';
import { execTransaction } from '../redis/transaction';
import { toSaleHash } from './sale';

export type RebuildResult = 'REDIS_INTACT' | 'NO_SALE' | 'REBUILT';

/**
 * Restores Redis from Postgres when the sale keys are missing, e.g. after Redis
 * lost its data. Settled purchases come back exactly; purchases that were still
 * PENDING (in Redis only) are lost and their units return to stock.
 */
export async function rebuildRedisFromPostgres(db: Database, redis: Redis): Promise<RebuildResult> {
  if (await redis.exists(redisKeys.sale)) return 'REDIS_INTACT';

  const sale = await findLatestSale(db);
  if (!sale) return 'NO_SALE';

  const purchases = await findPurchasesForSale(db, sale.id);
  const confirmedCount = purchases.filter((purchase) => purchase.status === 'CONFIRMED').length;

  const transaction = redis
    .multi()
    .del(redisKeys.stock, redisKeys.purchases)
    .set(redisKeys.stock, sale.totalStock - confirmedCount);

  for (const purchase of purchases) {
    transaction.hset(
      redisKeys.purchases,
      purchase.userId,
      serializePurchaseRecord({
        purchaseId: purchase.id,
        status: purchase.status,
        createdAt: purchase.createdAt.toISOString(),
      }),
    );
  }

  // Written last: the sale hash is what the gate checks, so the sale only
  // reopens once stock and buyers are back in place.
  transaction.hset(redisKeys.sale, toSaleHash(sale));
  await execTransaction(transaction);
  await ensurePurchaseConsumerGroup(redis);

  return 'REBUILT';
}
