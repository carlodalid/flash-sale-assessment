import { loadEnvFile } from '../src/config';
import { createDatabase, type Database } from '../src/db/pool';
import { createRedis, type Redis } from '../src/redis/client';
import type { NewSale, Sale } from '../src/sale/sale';
import { setupSale } from '../src/sale/setup-sale';

loadEnvFile();

/** Separate from the dev database and Redis DB 0, so tests never touch demo data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://flash:flash@localhost:5432/flash_sale_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

export interface TestContext {
  db: Database;
  redis: Redis;
  close(): Promise<void>;
}

export function createTestContext(): TestContext {
  const db = createDatabase(TEST_DATABASE_URL);
  const redis = createRedis(TEST_REDIS_URL);
  return {
    db,
    redis,
    close: async () => {
      await Promise.all([redis.quit(), db.end()]);
    },
  };
}

const MINUTE = 60_000;

/** Starts a sale that is active right now unless the overrides say otherwise. */
export function startSale(context: TestContext, overrides: Partial<NewSale> = {}): Promise<Sale> {
  const now = Date.now();
  return setupSale(context.db, context.redis, {
    product: { name: 'Test Sneakers', imageUrl: '/product.svg', priceCents: 12_900 },
    totalStock: 10,
    startsAt: new Date(now - MINUTE),
    endsAt: new Date(now + 60 * MINUTE),
    ...overrides,
  });
}
