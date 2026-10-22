import type { NewSale, Sale } from '../sale/sale';
import { withTransaction, type Database } from './pool';

interface SaleRow {
  id: number;
  product_name: string;
  product_image_url: string;
  price_cents: number;
  total_stock: number;
  starts_at: Date;
  ends_at: Date;
}

/**
 * Replaces whatever sale exists with a fresh one, deleting all purchases.
 * The identity column is intentionally *not* reset, so a message from a
 * previous sale can never be mistaken for one belonging to the new sale.
 */
export async function replaceSale(db: Database, sale: NewSale): Promise<Sale> {
  return withTransaction(db, async (client) => {
    await client.query('TRUNCATE purchases, sales');
    const { rows } = await client.query<SaleRow>(
      `INSERT INTO sales (product_name, product_image_url, price_cents, total_stock, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        sale.product.name,
        sale.product.imageUrl,
        sale.product.priceCents,
        sale.totalStock,
        sale.startsAt,
        sale.endsAt,
      ],
    );
    return toSale(rows[0]!);
  });
}

export async function findLatestSale(db: Database): Promise<Sale | null> {
  const { rows } = await db.query<SaleRow>('SELECT * FROM sales ORDER BY id DESC LIMIT 1');
  return rows[0] ? toSale(rows[0]) : null;
}

function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    product: {
      name: row.product_name,
      imageUrl: row.product_image_url,
      priceCents: row.price_cents,
    },
    totalStock: row.total_stock,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}
