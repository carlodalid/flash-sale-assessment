import type { SaleState } from '@flash-sale/shared';

const BADGES: Record<SaleState, { label: string; tone: 'info' | 'success' | 'error' | 'muted' }> = {
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  ACTIVE: { label: 'Live now', tone: 'success' },
  SOLD_OUT: { label: 'Sold out', tone: 'error' },
  ENDED: { label: 'Ended', tone: 'muted' },
};

export function SaleStatusBadge({ state }: { state: SaleState }) {
  const { label, tone } = BADGES[state];

  return (
    <span className={`status-badge status-badge--${tone}`} role="status" aria-live="polite">
      <span className="status-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
