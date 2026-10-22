import type { Redis } from 'ioredis';
import { PURCHASE_CONSUMER_GROUP, redisKeys } from '../redis/keys';

/** An accepted purchase as it travels from the gate to the worker. */
export interface PurchaseMessage {
  messageId: string;
  purchaseId: string;
  saleId: number;
  userId: string;
  createdAt: string;
}

/** A raw stream entry as Redis returns it: `[id, [field1, value1, field2, value2, ...]]`. */
export type RawStreamEntry = [string, string[]];

/**
 * Creates the consumer group (and the stream) if they don't exist yet. Starting
 * from ID 0 means a newly created group also picks up anything already queued.
 */
export async function ensurePurchaseConsumerGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup('CREATE', redisKeys.purchaseStream, PURCHASE_CONSUMER_GROUP, '0', 'MKSTREAM');
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('BUSYGROUP'))) throw error;
  }
}

export function parseStreamEntries(entries: RawStreamEntry[]): PurchaseMessage[] {
  return entries.map(([messageId, fieldList]) => {
    const fields = toFieldMap(fieldList);
    return {
      messageId,
      purchaseId: requireField(fields, 'purchaseId', messageId),
      saleId: Number(requireField(fields, 'saleId', messageId)),
      userId: requireField(fields, 'userId', messageId),
      createdAt: requireField(fields, 'createdAt', messageId),
    };
  });
}

function toFieldMap(fieldList: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (let i = 0; i < fieldList.length; i += 2) {
    fields.set(fieldList[i]!, fieldList[i + 1]!);
  }
  return fields;
}

function requireField(fields: Map<string, string>, name: string, messageId: string): string {
  const value = fields.get(name);
  if (value === undefined) {
    throw new Error(`Stream message ${messageId} is missing field "${name}".`);
  }
  return value;
}
