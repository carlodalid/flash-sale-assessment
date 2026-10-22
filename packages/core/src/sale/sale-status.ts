import { computeSaleState, type SaleStatusResponse } from '@flash-sale/shared';
import type { Redis } from 'ioredis';
import { redisKeys } from '../redis/keys';
import { execTransaction } from '../redis/transaction';
import { fromSaleHash } from './sale';

/**
 * Reads the sale entirely from Redis: every browser polls this endpoint, so it
 * must stay off Postgres. Returns null when no sale has been set up.
 */
export async function getSaleStatus(redis: Redis, now = new Date()): Promise<SaleStatusResponse | null> {
  const [saleHash, stock] = (await execTransaction(
    redis.multi().hgetall(redisKeys.sale).get(redisKeys.stock),
  )) as [Record<string, string>, string | null];

  const sale = fromSaleHash(saleHash);
  if (!sale) return null;

  const remainingStock = Math.max(0, Number(stock ?? 0));

  return {
    state: computeSaleState(sale, remainingStock, now),
    startsAt: sale.startsAt.toISOString(),
    endsAt: sale.endsAt.toISOString(),
    totalStock: sale.totalStock,
    remainingStock,
    product: sale.product,
    serverTime: now.toISOString(),
  };
}
