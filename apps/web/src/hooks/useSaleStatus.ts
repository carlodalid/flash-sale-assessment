import { useCallback, useEffect, useState } from 'react';
import type { SaleStatusResponse } from '@flash-sale/shared';
import { fetchSale } from '../api';

const POLL_INTERVAL_MS = 2_000;
/** Lands the boundary refresh just after the transition rather than just before it. */
const BOUNDARY_MARGIN_MS = 50;
/** Longest delay `setTimeout` supports (~24.8 days); further boundaries are left to polling. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export type SaleQuery =
  | { kind: 'loading' }
  | { kind: 'no-sale' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; sale: SaleStatusResponse };

/**
 * Keeps the sale status current: polls for stock changes, and refreshes exactly
 * when the sale opens or closes so the page doesn't lag the transition by a poll.
 */
export function useSaleStatus(): SaleQuery {
  const [query, setQuery] = useState<SaleQuery>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const sale = await fetchSale();
      setQuery(sale ? { kind: 'ready', sale } : { kind: 'no-sale' });
    } catch {
      // Keep showing the last known sale through a brief network blip.
      setQuery((previous) => (previous.kind === 'ready' ? previous : { kind: 'unavailable' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const sale = query.kind === 'ready' ? query.sale : null;
  const nextBoundary = sale ? upcomingBoundary(sale) : null;
  const serverTime = sale?.serverTime;

  useEffect(() => {
    if (!nextBoundary || !serverTime) return;

    // Measured against the server's clock, not the browser's, so a wrong device
    // clock can't shift it. Rescheduled on every poll with the latest server time.
    const delay = Date.parse(nextBoundary) - Date.parse(serverTime) + BOUNDARY_MARGIN_MS;
    if (delay > MAX_TIMEOUT_MS) return;

    const timer = setTimeout(refresh, Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [nextBoundary, serverTime, refresh]);

  return query;
}

/** The next moment the state will change because of time: the start, then the end. */
function upcomingBoundary(sale: SaleStatusResponse): string | null {
  switch (sale.state) {
    case 'UPCOMING':
      return sale.startsAt;
    case 'ACTIVE':
      return sale.endsAt;
    case 'SOLD_OUT':
    case 'ENDED':
      return null;
  }
}
