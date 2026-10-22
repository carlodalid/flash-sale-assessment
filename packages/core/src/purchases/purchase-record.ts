import type { PurchaseStatus } from '@flash-sale/shared';

/** The value stored per user in the Redis purchases hash. */
export interface PurchaseRecord {
  purchaseId: string;
  status: PurchaseStatus;
  createdAt: string;
}

export function serializePurchaseRecord(record: PurchaseRecord): string {
  return JSON.stringify(record);
}

export function parsePurchaseRecord(json: string): PurchaseRecord {
  return JSON.parse(json) as PurchaseRecord;
}
