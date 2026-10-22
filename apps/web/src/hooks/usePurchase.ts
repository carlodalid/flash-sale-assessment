import { useEffect, useState } from 'react';
import { normalizeUserId, type PurchaseStatusResponse } from '@flash-sale/shared';
import { fetchPurchaseStatus, submitPurchase } from '../api';

const PENDING_POLL_INTERVAL_MS = 1_000;
const NETWORK_ERROR = 'Could not reach the server. Please try again.';

export interface PurchaseFlow {
  status: PurchaseStatusResponse | null;
  error: string | null;
  busy: boolean;
  buy(rawUserId: string): Promise<void>;
  check(rawUserId: string): Promise<void>;
}

/**
 * Buying returns PENDING straight away; the worker confirms shortly after. While
 * the latest status is PENDING we keep polling until it settles.
 */
export function usePurchase(): PurchaseFlow {
  const [status, setStatus] = useState<PurchaseStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status?.status !== 'PENDING') return;

    const timer = setTimeout(async () => {
      try {
        setStatus(await fetchPurchaseStatus(status.userId));
      } catch {
        setError(NETWORK_ERROR);
      }
    }, PENDING_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status]);

  async function run(rawUserId: string, action: (userId: string) => Promise<void>) {
    const validation = normalizeUserId(rawUserId);
    setStatus(null);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await action(validation.userId);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const buy = (rawUserId: string) =>
    run(rawUserId, async (userId) => {
      const result = await submitPurchase(userId);
      if (result.accepted) setStatus(result.purchase);
      else setError(result.error.message);
    });

  const check = (rawUserId: string) =>
    run(rawUserId, async (userId) => setStatus(await fetchPurchaseStatus(userId)));

  return { status, error, busy, buy, check };
}
