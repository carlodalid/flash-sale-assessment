import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { redisKeys } from '../redis/keys';
import { LuaScript } from '../redis/lua-script';
import { createLogger } from '../logger';
import { serializePurchaseRecord, type PurchaseRecord } from './purchase-record';

export type PurchaseAttempt =
  | { outcome: 'ACCEPTED'; purchase: PurchaseRecord }
  | { outcome: 'ALREADY_PURCHASED' | 'SOLD_OUT' | 'SALE_NOT_ACTIVE' };

export interface ReplicaAckOptions {
  /** Replicas that must have the write before we reply. 0 skips the wait. */
  minReplicaAcks: number;
  timeoutMs: number;
}

const attemptPurchaseScript = LuaScript.load('attempt-purchase.lua');
const logger = createLogger('purchase-gate');

/**
 * Tries to claim one unit for `userId` (already normalised). On success the
 * purchase is PENDING in Redis and queued for the worker in the same atomic step.
 */
export async function attemptPurchase(
  redis: Redis,
  userId: string,
  replicaAcks: ReplicaAckOptions = { minReplicaAcks: 0, timeoutMs: 0 },
): Promise<PurchaseAttempt> {
  const purchase: PurchaseRecord = {
    purchaseId: randomUUID(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  const outcome = await attemptPurchaseScript.run(
    redis,
    [redisKeys.sale, redisKeys.stock, redisKeys.purchases, redisKeys.purchaseStream],
    [userId, serializePurchaseRecord(purchase), purchase.purchaseId, purchase.createdAt],
  );

  switch (outcome) {
    case 'ACCEPTED':
      await waitForReplicas(redis, replicaAcks);
      return { outcome, purchase };
    case 'ALREADY_PURCHASED':
    case 'SOLD_OUT':
    case 'SALE_NOT_ACTIVE':
      return { outcome };
    default:
      throw new Error(`Unexpected purchase gate result: ${String(outcome)}`);
  }
}

/**
 * Redis replicates asynchronously, so a failover can lose a write we've already
 * acknowledged. WAIT narrows that window by blocking until replicas confirm.
 * It's best effort: on timeout the purchase is still accepted, and we log it.
 */
async function waitForReplicas(redis: Redis, { minReplicaAcks, timeoutMs }: ReplicaAckOptions) {
  if (minReplicaAcks === 0) return;

  const acknowledged = Number(await redis.call('WAIT', minReplicaAcks, timeoutMs));
  if (acknowledged < minReplicaAcks) {
    logger.warn('Purchase accepted before reaching the required replicas', {
      acknowledged,
      required: minReplicaAcks,
    });
  }
}
