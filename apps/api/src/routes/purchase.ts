import { Router } from 'express';
import { attemptPurchase, getPurchaseStatus, type PurchaseAttempt } from '@flash-sale/core';
import { normalizeUserId, type PurchaseAcceptedResponse } from '@flash-sale/shared';
import type { AppDependencies } from '../app';
import { sendError } from '../errors';

type Rejection = Exclude<PurchaseAttempt['outcome'], 'ACCEPTED'>;

const REJECTIONS: Record<Rejection, { httpStatus: number; message: string }> = {
  ALREADY_PURCHASED: { httpStatus: 409, message: 'You have already purchased this item.' },
  SOLD_OUT: { httpStatus: 410, message: 'Sorry, the item is sold out.' },
  SALE_NOT_ACTIVE: { httpStatus: 403, message: 'The sale is not active right now.' },
};

export function purchaseRouter({ redis, db, replicaAcks }: AppDependencies): Router {
  const router = Router();

  /**
   * 202 Accepted rather than 201 Created: the unit is secured, but the purchase
   * is persisted asynchronously by the worker. Poll the status endpoint for the outcome.
   */
  router.post('/purchase', async (req, res) => {
    const validation = normalizeUserId(req.body?.userId);
    if (!validation.valid) {
      sendError(res, 400, 'INVALID_USER_ID', validation.reason);
      return;
    }

    const attempt = await attemptPurchase(redis, validation.userId, replicaAcks);
    if (attempt.outcome !== 'ACCEPTED') {
      const { httpStatus, message } = REJECTIONS[attempt.outcome];
      sendError(res, httpStatus, attempt.outcome, message);
      return;
    }

    const body: PurchaseAcceptedResponse = {
      userId: validation.userId,
      status: 'PENDING',
      purchaseId: attempt.purchase.purchaseId,
      createdAt: attempt.purchase.createdAt,
    };
    res.status(202).json(body);
  });

  router.get('/purchase/:userId', async (req, res) => {
    const validation = normalizeUserId(req.params.userId);
    if (!validation.valid) {
      sendError(res, 400, 'INVALID_USER_ID', validation.reason);
      return;
    }

    const status = await getPurchaseStatus(redis, db, validation.userId);
    res
      .status(status.status === 'NOT_FOUND' ? 404 : 200)
      .set('Cache-Control', 'no-store')
      .json(status);
  });

  return router;
}
