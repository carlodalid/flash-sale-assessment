import type { SaleState } from './types';

export interface SaleWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * The window is half-open: the sale is active from `startsAt` (inclusive) until
 * `endsAt` (exclusive). The purchase gate in Redis applies the same rule.
 *
 * Time takes precedence over stock: a sold-out sale still reports ENDED once its
 * window has closed.
 */
export function computeSaleState(
  window: SaleWindow,
  remainingStock: number,
  now: Date,
): SaleState {
  if (now < window.startsAt) return 'UPCOMING';
  if (now >= window.endsAt) return 'ENDED';
  if (remainingStock <= 0) return 'SOLD_OUT';
  return 'ACTIVE';
}
