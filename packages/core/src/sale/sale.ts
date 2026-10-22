import type { Product } from '@flash-sale/shared';

export interface Sale {
  id: number;
  product: Product;
  totalStock: number;
  startsAt: Date;
  endsAt: Date;
}

export type NewSale = Omit<Sale, 'id'>;

/**
 * Field names of the sale hash in Redis. Times are stored as epoch milliseconds
 * so the Lua purchase gate can compare them with Redis' own clock.
 */
export type SaleHash = Record<
  'id' | 'productName' | 'productImageUrl' | 'priceCents' | 'totalStock' | 'startsAtMs' | 'endsAtMs',
  string
>;

export function toSaleHash(sale: Sale): SaleHash {
  return {
    id: String(sale.id),
    productName: sale.product.name,
    productImageUrl: sale.product.imageUrl,
    priceCents: String(sale.product.priceCents),
    totalStock: String(sale.totalStock),
    startsAtMs: String(sale.startsAt.getTime()),
    endsAtMs: String(sale.endsAt.getTime()),
  };
}

/** Returns null for an empty hash, which is what HGETALL gives for a missing key. */
export function fromSaleHash(hash: Partial<SaleHash>): Sale | null {
  const { id, productName, productImageUrl, priceCents, totalStock, startsAtMs, endsAtMs } = hash;
  if (
    id === undefined ||
    productName === undefined ||
    productImageUrl === undefined ||
    priceCents === undefined ||
    totalStock === undefined ||
    startsAtMs === undefined ||
    endsAtMs === undefined
  ) {
    return null;
  }

  return {
    id: Number(id),
    product: { name: productName, imageUrl: productImageUrl, priceCents: Number(priceCents) },
    totalStock: Number(totalStock),
    startsAt: new Date(Number(startsAtMs)),
    endsAt: new Date(Number(endsAtMs)),
  };
}
