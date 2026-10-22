export { loadConfig, loadEnvFile, type Config } from './config';
export { createLogger, describeError, type Logger } from './logger';

export { createDatabase, type Database } from './db/pool';
export { runMigrations } from './db/migrate';
export { findLatestSale } from './db/sale-repository';
export { findPurchasesForSale, insertPurchase, type PurchaseRow } from './db/purchase-repository';

export { createRedis, type Redis } from './redis/client';
export { redisKeys, PURCHASE_CONSUMER_GROUP } from './redis/keys';

export type { Sale, NewSale } from './sale/sale';
export { setupSale } from './sale/setup-sale';
export { getSaleStatus } from './sale/sale-status';
export { rebuildRedisFromPostgres, type RebuildResult } from './sale/rebuild-redis';

export { attemptPurchase, type PurchaseAttempt, type ReplicaAckOptions } from './purchases/purchase-gate';
export { getPurchaseStatus } from './purchases/purchase-status';
export {
  PurchaseConsumer,
  type PurchaseConsumerOptions,
  type SettlementOutcome,
} from './purchases/purchase-consumer';
export { parseStreamEntries, type PurchaseMessage } from './purchases/purchase-stream';
