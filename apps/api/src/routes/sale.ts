import { Router } from 'express';
import { getSaleStatus } from '@flash-sale/core';
import type { AppDependencies } from '../app';
import { sendError } from '../errors';

export function saleRouter({ redis }: AppDependencies): Router {
  const router = Router();

  router.get('/sale', async (_req, res) => {
    const status = await getSaleStatus(redis);
    if (!status) {
      sendError(res, 404, 'NO_SALE', 'No sale has been set up yet. Run `pnpm sale:setup`.');
      return;
    }

    // Browsers poll this; stock changes every second, so never cache it.
    res.set('Cache-Control', 'no-store').json(status);
  });

  return router;
}
