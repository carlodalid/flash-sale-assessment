import { useState, type FormEvent } from 'react';
import type { SaleStatusResponse } from '@flash-sale/shared';
import { useSaleStatus } from '../hooks/useSaleStatus';
import { usePurchase } from '../hooks/usePurchase';
import { PurchaseNotice } from './PurchaseNotice';

export function ProductCard() {
  const query = useSaleStatus();
  const purchase = usePurchase();
  const [userId, setUserId] = useState('');

  if (query.kind !== 'ready') {
    return <article className="card card--empty">{EMPTY_STATE_MESSAGES[query.kind]}</article>;
  }

  const { sale } = query;
  const canBuy = sale.state === 'ACTIVE' && !purchase.busy;

  const handleBuy = (event: FormEvent) => {
    event.preventDefault();
    void purchase.buy(userId);
  };

  return (
    <article className="card">
      <img className="card__image" src={sale.product.imageUrl} alt={sale.product.name} />

      <div className="card__body">
        <h1 className="card__title">{sale.product.name}</h1>
        <p className="card__price">{formatPrice(sale.product.priceCents)}</p>
        <p className={`card__availability card__availability--${sale.state.toLowerCase()}`}>
          {describeAvailability(sale)}
        </p>

        <form className="buy-form" onSubmit={handleBuy}>
          <label htmlFor="user-id">Username or email</label>
          <input
            id="user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="e.g. alice@example.com"
            autoComplete="username"
            spellCheck={false}
          />
          <button type="submit" className="button" disabled={!canBuy}>
            {purchase.busy ? 'Processing…' : 'Buy now'}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          disabled={purchase.busy}
          onClick={() => void purchase.check(userId)}
        >
          Check my purchase
        </button>

        <PurchaseNotice status={purchase.status} error={purchase.error} />
      </div>
    </article>
  );
}

const EMPTY_STATE_MESSAGES = {
  loading: 'Loading sale…',
  'no-sale': 'No sale is scheduled yet.',
  unavailable: 'The store is unavailable right now. Retrying…',
} as const;

function describeAvailability(sale: SaleStatusResponse): string {
  switch (sale.state) {
    case 'UPCOMING':
      return `Sale starts at ${formatStartTime(new Date(sale.startsAt))}`;
    case 'ACTIVE':
      return `${sale.remainingStock} of ${sale.totalStock} left`;
    case 'SOLD_OUT':
      return 'Sold out';
    case 'ENDED':
      return 'Sale has ended';
  }
}

function formatStartTime(startsAt: Date): string {
  const time = startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isToday = startsAt.toDateString() === new Date().toDateString();
  return isToday ? time : `${time} on ${startsAt.toLocaleDateString([], { dateStyle: 'medium' })}`;
}

const priceFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

function formatPrice(priceCents: number): string {
  return priceFormatter.format(priceCents / 100);
}
