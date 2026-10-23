import type { PurchaseStatusResponse } from '@flash-sale/shared';

interface Props {
  status: PurchaseStatusResponse | null;
  error: string | null;
}

type Tone = 'info' | 'error';

/**
 * Explains outcomes the Buy button can't: errors, failures and "no purchase".
 * Progress and success are shown on the button itself.
 */
export function PurchaseNotice({ status, error }: Props) {
  const notice = error ? { tone: 'error' as Tone, text: error } : status ? describeStatus(status) : null;

  return (
    <>
      {/* The button's label isn't announced when it changes, so say it here. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {status?.status === 'CONFIRMED' ? `Purchase confirmed for ${status.userId}.` : ''}
      </p>
      {notice && (
        <p className={`notice notice--${notice.tone}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}
    </>
  );
}

function describeStatus(status: PurchaseStatusResponse): { tone: Tone; text: string } | null {
  switch (status.status) {
    case 'PENDING':
    case 'CONFIRMED':
      return null;
    case 'FAILED':
      return {
        tone: 'error',
        text: `We couldn't complete the purchase for ${status.userId}. The item was returned to stock.`,
      };
    case 'NOT_FOUND':
      return { tone: 'info', text: `No purchase found for ${status.userId}.` };
  }
}
