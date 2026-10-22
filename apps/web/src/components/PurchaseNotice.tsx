import type { PurchaseStatusResponse } from '@flash-sale/shared';

interface Props {
  status: PurchaseStatusResponse | null;
  error: string | null;
}

type Tone = 'info' | 'success' | 'error';

export function PurchaseNotice({ status, error }: Props) {
  const notice = error ? { tone: 'error' as Tone, text: error } : status ? describeStatus(status) : null;
  if (!notice) return null;

  return (
    <p className={`notice notice--${notice.tone}`} role="status" aria-live="polite">
      {notice.text}
    </p>
  );
}

function describeStatus(status: PurchaseStatusResponse): { tone: Tone; text: string } {
  switch (status.status) {
    case 'PENDING':
      return { tone: 'info', text: `Order received for ${status.userId}. Confirming…` };
    case 'CONFIRMED':
      return { tone: 'success', text: `Purchase confirmed for ${status.userId}.` };
    case 'FAILED':
      return {
        tone: 'error',
        text: `We couldn't complete the purchase for ${status.userId}. The item was returned to stock.`,
      };
    case 'NOT_FOUND':
      return { tone: 'info', text: `No purchase found for ${status.userId}.` };
  }
}
