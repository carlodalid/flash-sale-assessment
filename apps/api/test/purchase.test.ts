import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PurchaseConsumer } from '@flash-sale/core';
import { createTestContext, startSale } from '@flash-sale/core/testing';
import type { PurchaseAcceptedResponse } from '@flash-sale/shared';
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

const buy = (body: unknown) =>
  fetch(`${server.url}/api/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const purchaseStatus = (userId: string) =>
  fetch(`${server.url}/api/purchase/${encodeURIComponent(userId)}`);

describe('POST /api/purchase', () => {
  beforeEach(() => startSale(context, { totalStock: 2 }));

  it('is 202 PENDING for a winning buyer, with the identifier normalised', async () => {
    const response = await buy({ userId: '  Alice@Example.com ' });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      userId: 'alice@example.com',
      status: 'PENDING',
      purchaseId: expect.any(String),
    });
  });

  it('is 409 ALREADY_PURCHASED for a second attempt by the same buyer', async () => {
    await buy({ userId: 'alice@example.com' });

    const response = await buy({ userId: 'ALICE@example.com' });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'ALREADY_PURCHASED' });
  });

  it('is 410 SOLD_OUT once the stock is gone', async () => {
    await buy({ userId: 'alice' });
    await buy({ userId: 'bob' });

    const response = await buy({ userId: 'carol' });

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: 'SOLD_OUT' });
  });

  it('is 403 SALE_NOT_ACTIVE outside the sale window', async () => {
    const inAnHour = Date.now() + 60 * 60_000;
    await startSale(context, { startsAt: new Date(inAnHour), endsAt: new Date(inAnHour + 60_000) });

    const response = await buy({ userId: 'alice' });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'SALE_NOT_ACTIVE' });
  });

  it.each([
    ['a missing identifier', {}],
    ['a non-string identifier', { userId: 42 }],
    ['an identifier that is too short', { userId: 'ab' }],
    ['an identifier with disallowed characters', { userId: 'alice smith' }],
  ])('is 400 INVALID_USER_ID for %s', async (_, body) => {
    const response = await buy(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'INVALID_USER_ID' });
  });

  it('is 400 BAD_REQUEST for malformed JSON', async () => {
    const response = await buy('{"userId": ');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'BAD_REQUEST' });
  });
});

describe('GET /api/purchase/:userId', () => {
  beforeEach(() => startSale(context, { totalStock: 2 }));

  it('is 404 NOT_FOUND for someone who has not bought', async () => {
    const response = await purchaseStatus('alice');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ userId: 'alice', status: 'NOT_FOUND' });
  });

  it('follows a purchase from PENDING to CONFIRMED, and is never cached', async () => {
    const accepted = (await (await buy({ userId: 'alice' })).json()) as PurchaseAcceptedResponse;

    const pending = await purchaseStatus('alice');
    expect(pending.status).toBe(200);
    expect(pending.headers.get('cache-control')).toBe('no-store');
    expect(await pending.json()).toMatchObject({ status: 'PENDING', purchaseId: accepted.purchaseId });

    await new PurchaseConsumer(context.redis, context.db, { consumerName: 'test-consumer', blockMs: 50 })
      .processNextBatch();

    expect(await (await purchaseStatus('Alice')).json()).toMatchObject({
      status: 'CONFIRMED',
      purchaseId: accepted.purchaseId,
    });
  });

  it('is 400 INVALID_USER_ID for an invalid identifier', async () => {
    const response = await purchaseStatus('a/b');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'INVALID_USER_ID' });
  });
});
