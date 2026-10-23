import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attemptPurchase, redisKeys } from '@flash-sale/core';
import { createTestContext, startSale } from '@flash-sale/core/testing';
import { startTestServer, type TestServer } from './test-server';

const context = createTestContext();
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(context);
});
afterAll(async () => {
  await server.close();
  await context.close();
});

const getSale = () => fetch(`${server.url}/api/sale`);

describe('GET /api/sale', () => {
  it('returns the live sale and is never cached', async () => {
    await startSale(context, { totalStock: 10 });
    await attemptPurchase(context.redis, 'alice');

    const response = await getSale();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      state: 'ACTIVE',
      totalStock: 10,
      remainingStock: 9,
      product: { name: 'Test Sneakers', priceCents: 12_900 },
    });
  });

  it('reports UPCOMING before the window opens', async () => {
    const inAnHour = Date.now() + 60 * 60_000;
    await startSale(context, { startsAt: new Date(inAnHour), endsAt: new Date(inAnHour + 60_000) });

    expect(await (await getSale()).json()).toMatchObject({ state: 'UPCOMING' });
  });

  it('is 404 NO_SALE when no sale has been set up', async () => {
    await context.redis.del(...Object.values(redisKeys));

    const response = await getSale();

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'NO_SALE' });
  });
});

describe('GET /healthz', () => {
  it('is 200 when Redis and Postgres respond', async () => {
    const response = await fetch(`${server.url}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: { redis: 'ok', postgres: 'ok' } });
  });
});

describe('unknown routes', () => {
  it('are 404 NOT_FOUND', async () => {
    const response = await fetch(`${server.url}/api/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
