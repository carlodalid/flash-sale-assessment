import { describe, expect, it } from 'vitest';
import { computeSaleState } from './sale-state';

const window = {
  startsAt: new Date('2026-01-01T10:00:00Z'),
  endsAt: new Date('2026-01-01T11:00:00Z'),
};

const at = (iso: string) => new Date(iso);

describe('computeSaleState', () => {
  it('is UPCOMING before the window opens', () => {
    expect(computeSaleState(window, 100, at('2026-01-01T09:59:59.999Z'))).toBe('UPCOMING');
  });

  it('is ACTIVE from the exact start instant', () => {
    expect(computeSaleState(window, 100, at('2026-01-01T10:00:00Z'))).toBe('ACTIVE');
  });

  it('is ACTIVE until just before the end', () => {
    expect(computeSaleState(window, 1, at('2026-01-01T10:59:59.999Z'))).toBe('ACTIVE');
  });

  it('is ENDED at the exact end instant (the window is half-open)', () => {
    expect(computeSaleState(window, 100, at('2026-01-01T11:00:00Z'))).toBe('ENDED');
  });

  it('is SOLD_OUT during the window once stock reaches zero', () => {
    expect(computeSaleState(window, 0, at('2026-01-01T10:30:00Z'))).toBe('SOLD_OUT');
  });

  it('reports ENDED rather than SOLD_OUT after the window closes', () => {
    expect(computeSaleState(window, 0, at('2026-01-01T12:00:00Z'))).toBe('ENDED');
  });

  it('reports UPCOMING even if stock is somehow zero before the start', () => {
    expect(computeSaleState(window, 0, at('2026-01-01T09:00:00Z'))).toBe('UPCOMING');
  });
});
