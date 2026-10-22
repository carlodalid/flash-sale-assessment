import { Router } from 'express';
import { describeError } from '@flash-sale/core';
import type { AppDependencies } from '../app';

type CheckResult = 'ok' | string;

export function healthRouter({ redis, db }: AppDependencies): Router {
  const router = Router();

  router.get('/healthz', async (_req, res) => {
    const [redisCheck, postgresCheck] = await Promise.all([
      check(() => redis.ping()),
      check(() => db.query('SELECT 1')),
    ]);
    const healthy = redisCheck === 'ok' && postgresCheck === 'ok';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks: { redis: redisCheck, postgres: postgresCheck },
    });
  });

  return router;
}

async function check(probe: () => Promise<unknown>): Promise<CheckResult> {
  try {
    await probe();
    return 'ok';
  } catch (error) {
    return describeError(error);
  }
}
