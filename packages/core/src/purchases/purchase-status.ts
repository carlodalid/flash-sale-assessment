import type { PurchaseStatusResponse } from '@flash-sale/shared';
import type { Redis } from 'ioredis';
import type { Database } from '../db/pool';
import { findPurchaseByUserId } from '../db/purchase-repository';
import { redisKeys } from '../redis/keys';
import { parsePurchaseRecord } from './purchase-record';

/**
 * Redis is checked first: it is the only place a PENDING purchase exists, and it
 * keeps status polling off Postgres. Postgres is the fallback for anything Redis
 * no longer holds.
 */
export async function getPurchaseStatus(
  redis: Redis,
  db: Database,
  userId: string,
): Promise<PurchaseStatusResponse> {
  const cached = await redis.hget(redisKeys.purchases, userId);
  if (cached) {
    const record = parsePurchaseRecord(cached);
    return { userId, ...record };
  }

  const stored = await findPurchaseByUserId(db, userId);
  if (stored) {
    return {
      userId,
      purchaseId: stored.id,
      status: stored.status,
      createdAt: stored.createdAt.toISOString(),
    };
  }

  return { userId, status: 'NOT_FOUND' };
}
