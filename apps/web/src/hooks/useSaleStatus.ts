import { useEffect, useState } from 'react';
import type { SaleStatusResponse } from '@flash-sale/shared';
import { fetchSale } from '../api';

const POLL_INTERVAL_MS = 2_000;

export type SaleQuery =
  | { kind: 'loading' }
  | { kind: 'no-sale' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; sale: SaleStatusResponse };

/** Polls the sale status so stock and state stay current without a page refresh. */
export function useSaleStatus(): SaleQuery {
  const [query, setQuery] = useState<SaleQuery>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const sale = await fetchSale();
        if (!cancelled) setQuery(sale ? { kind: 'ready', sale } : { kind: 'no-sale' });
      } catch {
        // Keep showing the last known sale through a brief network blip.
        if (!cancelled) setQuery((previous) => (previous.kind === 'ready' ? previous : { kind: 'unavailable' }));
      }
    }

    void refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return query;
}
