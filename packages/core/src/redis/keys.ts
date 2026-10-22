/**
 * Every key shares the `{flash-sale}` hash tag, so in Redis Cluster they all land
 * in the same slot. That is a requirement for the Lua scripts, which touch several
 * of these keys atomically.
 */
const TAG = '{flash-sale}';

export const redisKeys = {
  /** Hash: the current sale's product, stock total and window. See `SaleHash`. */
  sale: `${TAG}:sale`,
  /** String counter: units still available. */
  stock: `${TAG}:stock`,
  /** Hash: userId -> JSON `PurchaseRecord`. Doubles as the "has bought" check. */
  purchases: `${TAG}:purchases`,
  /** Stream of accepted purchases waiting to be written to Postgres. */
  purchaseStream: `${TAG}:purchase-stream`,
  /** Stream of purchases the worker gave up on. */
  deadLetterStream: `${TAG}:purchase-dead-letter`,
} as const;

export const PURCHASE_CONSUMER_GROUP = 'purchase-writers';
