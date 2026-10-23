/**
 * Starts a fresh sale, wiping all previous purchases. Times are rounded down to
 * the whole minute, matching how the page displays them.
 *
 *   pnpm sale:setup --stock 100 --start-in 30s --duration 5m
 *   pnpm sale:setup --stock 50 --start 2026-10-23T09:00:00Z --end 2026-10-23T09:15:00Z
 *   pnpm sale:setup --name "Retro Console" --price 199.99 --image /my-photo.jpg
 */
import { parseArgs } from 'node:util';
import {
  createDatabase,
  createRedis,
  loadConfig,
  loadEnvFile,
  runMigrations,
  setupSale,
  type NewSale,
} from '@flash-sale/core';
import { floorToMinute, parseDuration } from '@flash-sale/shared';

const DEFAULTS = {
  stock: '100',
  // Rounded down, this is the start of the next whole minute.
  startIn: '1m',
  duration: '5m',
  name: 'Limited Edition Sneakers',
  price: '129.00',
  image: '/product.svg',
};

function parseSaleOptions(argv: string[], now: Date): NewSale {
  // `pnpm sale:setup -- --stock 5` forwards the `--` separator; drop it.
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  const { values } = parseArgs({
    args,
    options: {
      stock: { type: 'string', default: DEFAULTS.stock },
      'start-in': { type: 'string', default: DEFAULTS.startIn },
      duration: { type: 'string', default: DEFAULTS.duration },
      start: { type: 'string' },
      end: { type: 'string' },
      name: { type: 'string', default: DEFAULTS.name },
      price: { type: 'string', default: DEFAULTS.price },
      image: { type: 'string', default: DEFAULTS.image },
    },
  });

  const totalStock = Number(values.stock);
  if (!Number.isInteger(totalStock) || totalStock <= 0) {
    throw new Error(`--stock must be a positive integer, got "${values.stock}".`);
  }

  const priceCents = Math.round(Number(values.price) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    throw new Error(`--price must be a non-negative amount, got "${values.price}".`);
  }

  // A start rounded into the past (e.g. --start-in 10s at 09:01:55) opens the sale immediately.
  const startsAt = floorToMinute(
    values.start
      ? parseDate(values.start, '--start')
      : new Date(now.getTime() + parseDuration(values['start-in'])),
  );
  // The duration is added to the rounded start, so --duration 5m is exactly 5 minutes.
  const endsAt = floorToMinute(
    values.end
      ? parseDate(values.end, '--end')
      : new Date(startsAt.getTime() + parseDuration(values.duration)),
  );
  if (endsAt <= startsAt) {
    throw new Error('The sale must last at least one minute (times are rounded down to the whole minute).');
  }

  return {
    product: { name: values.name, imageUrl: values.image, priceCents },
    totalStock,
    startsAt,
    endsAt,
  };
}

function parseDate(input: string, flag: string): Date {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${flag} must be an ISO-8601 date-time, got "${input}".`);
  }
  return date;
}

loadEnvFile();
const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);

try {
  const input = parseSaleOptions(process.argv.slice(2), new Date());
  await runMigrations(db);
  const sale = await setupSale(db, redis, input);

  console.log('Sale ready. All previous purchases were cleared. Times are whole minutes.');
  console.table({
    id: sale.id,
    product: sale.product.name,
    price: (sale.product.priceCents / 100).toFixed(2),
    stock: sale.totalStock,
    'starts (local)': sale.startsAt.toLocaleString(),
    'ends (local)': sale.endsAt.toLocaleString(),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([redis.quit(), db.end()]);
}
