import { computeSaleState, type SaleStatusResponse } from '@flash-sale/shared';
import type { Redis } from 'ioredis';
import { redisKeys } from '../redis/keys';
import { execTransaction } from '../redis/transaction';
import { fromSaleHash } from './sale';

/**
 * Reads the sale entirely from Redis: every browser polls this endpoint, so it
 * must stay off Postgres. Returns null when no sale has been set up.
 *
 * "Now" is Redis' clock, the same one the purchase gate uses, so the state shown
 * to users always matches what the gate would decide, regardless of the API
 * server's clock.
 */
export async function getSaleStatus(redis: Redis): Promise<SaleStatusResponse | null> {
  const [saleHash, stock, [seconds, microseconds]] = (await execTransaction(
    redis.multi().hgetall(redisKeys.sale).get(redisKeys.stock).time(),
  )) as [Record<string, string>, string | null, [string, string]];

  const sale = fromSaleHash(saleHash);
  if (!sale) return null;

  const now = new Date(Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000));
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
