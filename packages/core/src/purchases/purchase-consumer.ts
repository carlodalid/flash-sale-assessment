import { setTimeout as sleep } from 'node:timers/promises';
import type { Redis } from 'ioredis';
import { isPermanentDatabaseError } from '../db/errors';
import type { Database } from '../db/pool';
import { insertPurchase, type PurchaseRow } from '../db/purchase-repository';
import { describeError, createLogger } from '../logger';
import { PURCHASE_CONSUMER_GROUP, redisKeys } from '../redis/keys';
import { LuaScript } from '../redis/lua-script';
import { execTransaction } from '../redis/transaction';
import { serializePurchaseRecord } from './purchase-record';
import {
  ensurePurchaseConsumerGroup,
  parseStreamEntries,
  type PurchaseMessage,
  type RawStreamEntry,
} from './purchase-stream';

export interface PurchaseConsumerOptions {
  /** Unique per worker process; Redis tracks unacknowledged messages per consumer. */
  consumerName: string;
  batchSize?: number;
  /** How long one read waits for new messages before looping. */
  blockMs?: number;
  /** A message left unacknowledged this long is assumed to belong to a crashed worker. */
  reclaimIdleMs?: number;
  /** Delay before the first retry; doubles with each attempt up to `maxRetryDelayMs`. */
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  /** Seam for tests to simulate a failing database. */
  persistPurchase?: (purchase: PurchaseRow) => Promise<void>;
}

export type SettlementOutcome = 'CONFIRMED' | 'DEAD_LETTERED' | 'STALE';

const deadLetterScript = LuaScript.load('dead-letter-purchase.lua');
const logger = createLogger('purchase-consumer');

/**
 * Moves accepted purchases from the Redis stream into Postgres.
 *
 * Delivery is at-least-once: a message is only acknowledged after it is settled,
 * so a crash at any point leads to redelivery, never loss. The idempotent insert
 * makes redelivery harmless.
 */
export class PurchaseConsumer {
  private readonly consumerName: string;
  private readonly batchSize: number;
  private readonly blockMs: number;
  private readonly reclaimIdleMs: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly persistPurchase: (purchase: PurchaseRow) => Promise<void>;

  /**
   * `redis` should be a dedicated connection: reads block it for up to `blockMs`.
   */
  constructor(
    private readonly redis: Redis,
    db: Database,
    options: PurchaseConsumerOptions,
  ) {
    this.consumerName = options.consumerName;
    this.batchSize = options.batchSize ?? 50;
    this.blockMs = options.blockMs ?? 2_000;
    this.reclaimIdleMs = options.reclaimIdleMs ?? 30_000;
    this.retryDelayMs = options.retryDelayMs ?? 200;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
    this.persistPurchase = options.persistPurchase ?? ((purchase) => insertPurchase(db, purchase));
  }

  async run(signal: AbortSignal): Promise<void> {
    await ensurePurchaseConsumerGroup(this.redis);
    logger.info('Consuming purchases', { consumer: this.consumerName });

    while (!signal.aborted) {
      try {
        await this.processNextBatch(signal);
      } catch (error) {
        // Aborting interrupts a retry on purpose; its message stays unacknowledged
        // and another worker reclaims it.
        if (!signal.aborted) await this.recoverFromLoopError(error);
      }
    }
  }

  /** Settles one batch: abandoned messages first, otherwise new ones. Returns the batch size. */
  async processNextBatch(signal?: AbortSignal): Promise<number> {
    const reclaimed = await this.reclaimAbandonedMessages();
    const messages = reclaimed.length > 0 ? reclaimed : await this.readNewMessages();

    for (const message of messages) {
      await this.settle(message, signal);
    }
    return messages.length;
  }

  /**
   * Retries until the purchase is persisted. The unit is already the buyer's in
   * Redis, so an outage only delays confirmation; giving up would be wrong too,
   * because a failed attempt may have committed without us hearing back, and
   * returning that unit to stock would oversell it.
   *
   * Only an error Postgres will repeat on every attempt is dead-lettered.
   * Aborting `signal` stops retrying and rejects, leaving the message unacknowledged.
   */
  async settle(message: PurchaseMessage, signal?: AbortSignal): Promise<SettlementOutcome> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.confirm(message);
        return 'CONFIRMED';
      } catch (error) {
        if (isPermanentDatabaseError(error)) {
          return this.deadLetter(message, error);
        }
        logger.warn('Persisting purchase failed, retrying', {
          purchaseId: message.purchaseId,
          attempt,
          error: describeError(error),
        });
        await sleep(this.retryDelayFor(attempt), undefined, { signal });
      }
    }
  }

  private retryDelayFor(attempt: number): number {
    return Math.min(this.retryDelayMs * 2 ** (attempt - 1), this.maxRetryDelayMs);
  }

  private async confirm(message: PurchaseMessage): Promise<void> {
    await this.persistPurchase({
      id: message.purchaseId,
      saleId: message.saleId,
      userId: message.userId,
      status: 'CONFIRMED',
      createdAt: new Date(message.createdAt),
    });

    const record = serializePurchaseRecord({
      purchaseId: message.purchaseId,
      status: 'CONFIRMED',
      createdAt: message.createdAt,
    });
    await execTransaction(
      this.redis
        .multi()
        .hset(redisKeys.purchases, message.userId, record)
        .xack(redisKeys.purchaseStream, PURCHASE_CONSUMER_GROUP, message.messageId),
    );
  }

  private async deadLetter(message: PurchaseMessage, cause: unknown): Promise<SettlementOutcome> {
    const reason = describeError(cause);
    const failedRecord = serializePurchaseRecord({
      purchaseId: message.purchaseId,
      status: 'FAILED',
      createdAt: message.createdAt,
    });

    const result = await deadLetterScript.run(
      this.redis,
      [
        redisKeys.sale,
        redisKeys.stock,
        redisKeys.purchases,
        redisKeys.purchaseStream,
        redisKeys.deadLetterStream,
      ],
      [
        PURCHASE_CONSUMER_GROUP,
        message.messageId,
        message.saleId,
        message.userId,
        message.purchaseId,
        failedRecord,
        reason,
      ],
    );

    if (result === 'STALE') {
      logger.info('Dropped a message from a previous sale', { purchaseId: message.purchaseId });
      return 'STALE';
    }

    logger.error('Purchase dead-lettered and its unit returned to stock', {
      purchaseId: message.purchaseId,
      userId: message.userId,
      reason,
    });
    await this.recordFailureInPostgres(message);
    return 'DEAD_LETTERED';
  }

  /**
   * Best effort: the failure is already durable in Redis (status + dead-letter
   * stream), and Postgres may well be the reason we got here.
   */
  private async recordFailureInPostgres(message: PurchaseMessage): Promise<void> {
    try {
      await this.persistPurchase({
        id: message.purchaseId,
        saleId: message.saleId,
        userId: message.userId,
        status: 'FAILED',
        createdAt: new Date(message.createdAt),
      });
    } catch (error) {
      logger.warn('Could not record FAILED purchase in Postgres', {
        purchaseId: message.purchaseId,
        error: describeError(error),
      });
    }
  }

  private async reclaimAbandonedMessages(): Promise<PurchaseMessage[]> {
    const [, entries] = (await this.redis.call(
      'XAUTOCLAIM',
      redisKeys.purchaseStream,
      PURCHASE_CONSUMER_GROUP,
      this.consumerName,
      this.reclaimIdleMs,
      '0-0',
      'COUNT',
      this.batchSize,
    )) as [string, Array<RawStreamEntry | null>, string[]];

    const messages = parseStreamEntries(entries.filter((entry) => entry !== null));
    if (messages.length > 0) {
      logger.warn('Reclaimed messages abandoned by another consumer', { count: messages.length });
    }
    return messages;
  }

  private async readNewMessages(): Promise<PurchaseMessage[]> {
    const reply = (await this.redis.call(
      'XREADGROUP',
      'GROUP',
      PURCHASE_CONSUMER_GROUP,
      this.consumerName,
      'COUNT',
      this.batchSize,
      'BLOCK',
      this.blockMs,
      'STREAMS',
      redisKeys.purchaseStream,
      '>',
    )) as Array<[string, RawStreamEntry[]]> | null;

    return reply?.[0] ? parseStreamEntries(reply[0][1]) : [];
  }

  /**
   * `pnpm sale:setup` deletes and recreates the stream, which interrupts a blocked
   * read. That is expected, so we recreate the group if needed and carry on.
   * Anything else is logged and retried after a pause.
   */
  private async recoverFromLoopError(error: unknown): Promise<void> {
    const message = describeError(error);
    const streamWasReset = message.includes('NOGROUP') || message.includes('UNBLOCKED');

    if (streamWasReset) {
      logger.info('Purchase stream was reset; rejoining consumer group');
    } else {
      logger.error('Consumer loop failed; retrying shortly', { error: message });
      await sleep(1_000);
    }

    try {
      await ensurePurchaseConsumerGroup(this.redis);
    } catch {
      // Redis is still unavailable; the next iteration will fail and come back here.
    }
  }
}
