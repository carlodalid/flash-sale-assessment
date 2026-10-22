import type { Database } from './pool';

export interface PurchaseRow {
  id: string;
  saleId: number;
  userId: string;
  status: 'CONFIRMED' | 'FAILED';
  createdAt: Date;
}

interface PurchaseDbRow {
  id: string;
  sale_id: number;
  user_id: string;
  status: 'CONFIRMED' | 'FAILED';
  created_at: Date;
}

/**
 * Idempotent insert: if the worker crashes after writing but before acknowledging
 * the stream message, the redelivered message lands here again and is a no-op.
 */
export async function insertPurchase(db: Database, purchase: PurchaseRow): Promise<void> {
  await db.query(
    `INSERT INTO purchases (id, sale_id, user_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sale_id, user_id) DO NOTHING`,
    [purchase.id, purchase.saleId, purchase.userId, purchase.status, purchase.createdAt],
  );
}

/** There is only ever one sale at a time, so a user has at most one purchase. */
export async function findPurchaseByUserId(db: Database, userId: string): Promise<PurchaseRow | null> {
  const { rows } = await db.query<PurchaseDbRow>(
    'SELECT * FROM purchases WHERE user_id = $1 ORDER BY sale_id DESC LIMIT 1',
    [userId],
  );
  return rows[0] ? toPurchase(rows[0]) : null;
}

export async function findPurchasesForSale(db: Database, saleId: number): Promise<PurchaseRow[]> {
  const { rows } = await db.query<PurchaseDbRow>(
    'SELECT * FROM purchases WHERE sale_id = $1 ORDER BY created_at',
    [saleId],
  );
  return rows.map(toPurchase);
}

function toPurchase(row: PurchaseDbRow): PurchaseRow {
  return {
    id: row.id,
    saleId: row.sale_id,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
  };
}
