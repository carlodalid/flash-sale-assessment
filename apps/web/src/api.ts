import type {
  ErrorResponse,
  PurchaseAcceptedResponse,
  PurchaseStatusResponse,
  SaleStatusResponse,
} from '@flash-sale/shared';

/** Thin wrappers around the API. Network failures throw; HTTP outcomes are returned as data. */

export async function fetchSale(): Promise<SaleStatusResponse | null> {
  const response = await fetch('/api/sale');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/sale failed with ${response.status}`);
  return response.json();
}

export type PurchaseSubmission =
  | { accepted: true; purchase: PurchaseAcceptedResponse }
  | { accepted: false; error: ErrorResponse };

export async function submitPurchase(userId: string): Promise<PurchaseSubmission> {
  const response = await fetch('/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  return response.status === 202
    ? { accepted: true, purchase: await response.json() }
    : { accepted: false, error: await response.json() };
}

/** 404 is a normal answer here ("no purchase"), and carries a NOT_FOUND body. */
export async function fetchPurchaseStatus(userId: string): Promise<PurchaseStatusResponse> {
  const response = await fetch(`/api/purchase/${encodeURIComponent(userId)}`);
  if (!response.ok && response.status !== 404) {
    throw new Error(`GET /api/purchase failed with ${response.status}`);
  }
  return response.json();
}
