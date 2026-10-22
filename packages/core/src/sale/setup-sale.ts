import type { Redis } from 'ioredis';
import type { Database } from '../db/pool';
import { replaceSale } from '../db/sale-repository';
import { PURCHASE_CONSUMER_GROUP, redisKeys } from '../redis/keys';
import { execTransaction } from '../redis/transaction';
import { toSaleHash, type NewSale, type Sale } from './sale';

/**
 * Starts a fresh sale: Postgres first (the durable record), then Redis in one
 * transaction so the gate never sees a half-reset state.
 */
export async function setupSale(db: Database, redis: Redis, input: NewSale): Promise<Sale> {
  const sale = await replaceSale(db, input);

  await execTransaction(
    redis
      .multi()
      .del(
        redisKeys.sale,
        redisKeys.stock,
        redisKeys.purchases,
        redisKeys.purchaseStream,
        redisKeys.deadLetterStream,
      )
      .hset(redisKeys.sale, toSaleHash(sale))
      .set(redisKeys.stock, sale.totalStock)
      .xgroup('CREATE', redisKeys.purchaseStream, PURCHASE_CONSUMER_GROUP, '0', 'MKSTREAM'),
  );

  return sale;
}
