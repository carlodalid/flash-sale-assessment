import { useEffect, useRef, useState } from 'react';
import { normalizeUserId, type PurchaseStatusResponse } from '@flash-sale/shared';
import { fetchPurchaseStatus, submitPurchase } from '../api';

const PENDING_POLL_INTERVAL_MS = 1_000;
const NETWORK_ERROR = 'Could not reach the server. Please try again.';

export interface PurchaseFlow {
  status: PurchaseStatusResponse | null;
  error: string | null;
  /** From the click until the worker has settled the purchase. */
  confirming: boolean;
  purchased: boolean;
  buy(rawUserId: string): Promise<void>;
  check(rawUserId: string): Promise<void>;
  /** Forgets the current result, e.g. because the identifier changed. */
  reset(): void;
}

/**
 * Buying returns PENDING straight away; the worker confirms shortly after. While
 * the latest status is PENDING we keep polling until it settles.
 */
export function usePurchase(): PurchaseFlow {
  const [status, setStatus] = useState<PurchaseStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped on every new action and on reset, so a response that arrives for an
  // identifier the user has since changed is ignored instead of shown.
  const generation = useRef(0);

  useEffect(() => {
    if (status?.status !== 'PENDING') return;

    const startedIn = generation.current;
    const timer = setTimeout(async () => {
      try {
        const latest = await fetchPurchaseStatus(status.userId);
        if (generation.current === startedIn) setStatus(latest);
      } catch {
        if (generation.current === startedIn) setError(NETWORK_ERROR);
      }
    }, PENDING_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status]);

  function reset() {
    generation.current++;
    setStatus(null);
    setError(null);
    setBusy(false);
  }

  async function run(rawUserId: string, action: (userId: string) => Promise<void>) {
    reset();
    const validation = normalizeUserId(rawUserId);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }

    const startedIn = generation.current;
    setBusy(true);
    try {
      await action(validation.userId);
    } catch {
      if (generation.current === startedIn) setError(NETWORK_ERROR);
    } finally {
      if (generation.current === startedIn) setBusy(false);
    }
  }

  const buy = (rawUserId: string) =>
    run(rawUserId, async (userId) => {
      const startedIn = generation.current;
      const result = await submitPurchase(userId);
      if (generation.current !== startedIn) return;
      if (result.accepted) setStatus(result.purchase);
      else setError(result.error.message);
    });

  const check = (rawUserId: string) =>
    run(rawUserId, async (userId) => {
      const startedIn = generation.current;
      const latest = await fetchPurchaseStatus(userId);
      if (generation.current === startedIn) setStatus(latest);
    });

  return {
    status,
    error,
    confirming: busy || status?.status === 'PENDING',
    purchased: status?.status === 'CONFIRMED',
    buy,
    check,
    reset,
  };
}
