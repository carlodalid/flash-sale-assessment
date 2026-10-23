import { useState, type FormEvent } from 'react';
import type { SaleState, SaleStatusResponse } from '@flash-sale/shared';
import { useSaleStatus } from '../hooks/useSaleStatus';
import { usePurchase } from '../hooks/usePurchase';
import { PurchaseNotice } from './PurchaseNotice';
import { SaleStatusBadge } from './SaleStatusBadge';

export function ProductCard() {
  const query = useSaleStatus();
  const purchase = usePurchase();
  const [userId, setUserId] = useState('');

  if (query.kind !== 'ready') {
    return <article className="card card--empty">{EMPTY_STATE_MESSAGES[query.kind]}</article>;
  }

  const { sale } = query;
  const canBuy = sale.state === 'ACTIVE' && !purchase.confirming && !purchase.purchased;
  const stockLine = describeStock(sale);

  const handleBuy = (event: FormEvent) => {
    event.preventDefault();
    void purchase.buy(userId);
  };

  return (
    <article className="card">
      <img className="card__image" src={sale.product.imageUrl} alt={sale.product.name} />

      <div className="card__body">
        <SaleStatusBadge state={sale.state} />
        <h1 className="card__title">{sale.product.name}</h1>
        <p className="card__price">{formatPrice(sale.product.priceCents)}</p>

        <div className="card__sale-details">
          <p>{describeTiming(sale)}</p>
          {stockLine && <p className="card__stock">{stockLine}</p>}
        </div>

        <form className="buy-form" onSubmit={handleBuy}>
          <label htmlFor="user-id">Username or email</label>
          <input
            id="user-id"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              purchase.reset();
            }}
            placeholder="e.g. alice@example.com"
            autoComplete="username"
            spellCheck={false}
          />
          <button
            type="submit"
            className={purchase.purchased ? 'button button--purchased' : 'button'}
            disabled={!canBuy}
            aria-busy={purchase.confirming}
          >
            <BuyButtonContent
              confirming={purchase.confirming}
              purchased={purchase.purchased}
              saleLabel={BUTTON_LABELS[sale.state]}
            />
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          disabled={purchase.confirming}
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

/** The purchase's progress takes precedence over the sale's state. */
function BuyButtonContent(props: { confirming: boolean; purchased: boolean; saleLabel: string }) {
  if (props.confirming) {
    return (
      <>
        <span className="spinner" aria-hidden="true" />
        Confirming purchase
      </>
    );
  }
  return <>{props.purchased ? 'Purchased' : props.saleLabel}</>;
}

/** The button stays visible when disabled, so its label explains why. */
const BUTTON_LABELS: Record<SaleState, string> = {
  UPCOMING: 'Not started yet',
  ACTIVE: 'Buy now',
  SOLD_OUT: 'Sold out',
  ENDED: 'Sale ended',
};

function describeTiming(sale: SaleStatusResponse): string {
  switch (sale.state) {
    case 'UPCOMING':
      return `Starts at ${formatSaleTime(sale.startsAt)}`;
    case 'ACTIVE':
      return `Ends at ${formatSaleTime(sale.endsAt)}`;
    case 'SOLD_OUT':
      return `All ${sale.totalStock} units sold`;
    case 'ENDED':
      return `Ended at ${formatSaleTime(sale.endsAt)}`;
  }
}

function describeStock(sale: SaleStatusResponse): string | null {
  switch (sale.state) {
    case 'UPCOMING':
      return `${sale.totalStock} units available`;
    case 'ACTIVE':
      return `${sale.remainingStock} of ${sale.totalStock} left`;
    case 'SOLD_OUT':
    case 'ENDED':
      return null;
  }
}

/** Shown in the browser's timezone; adds the date when it isn't today. */
function formatSaleTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? time : `${time} on ${date.toLocaleDateString([], { dateStyle: 'medium' })}`;
}

const priceFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

function formatPrice(priceCents: number): string {
  return priceFormatter.format(priceCents / 100);
}
