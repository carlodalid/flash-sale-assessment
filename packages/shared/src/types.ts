/**
 * Contracts shared by the API and the web app. Everything here crosses the wire
 * as JSON, so dates are ISO-8601 strings.
 */

export type SaleState = 'UPCOMING' | 'ACTIVE' | 'SOLD_OUT' | 'ENDED';

export interface Product {
  name: string;
  imageUrl: string;
  priceCents: number;
}

export interface SaleStatusResponse {
  state: SaleState;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  remainingStock: number;
  product: Product;
  serverTime: string;
}

/** Lifecycle of an accepted purchase: PENDING until the worker persists it. */
export type PurchaseStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export type PurchaseStatusResponse =
  | {
      userId: string;
      status: PurchaseStatus;
      purchaseId: string;
      createdAt: string;
    }
  | {
      userId: string;
      status: 'NOT_FOUND';
    };

/** Body of a 202 from `POST /api/purchase`. */
export interface PurchaseAcceptedResponse {
  userId: string;
  status: 'PENDING';
  purchaseId: string;
  createdAt: string;
}

export type PurchaseRejectionReason =
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'SALE_NOT_ACTIVE'
  | 'INVALID_USER_ID';

export interface ErrorResponse {
  error: PurchaseRejectionReason | 'NO_SALE' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_ERROR';
  message: string;
}
